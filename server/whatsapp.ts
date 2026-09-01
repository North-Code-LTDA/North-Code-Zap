import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import type { Server as SocketIOServer } from 'socket.io';
import { type ContactsService } from './contacts';
import type {
  GroupParticipant,
  GroupParticipantsResponse,
  WhatsAppStatus,
  WhatsAppAccountInfo,
  WhatsAppGroup,
  ReceivedMessage,
  ScheduledMedia,
} from '../src/types';


const MAX_MESSAGES_IN_MEMORY = 100;

const RECONNECT_BACKOFF_MS = [2000, 5000, 10000, 20000, 30000, 60000];
const CONNECTION_SUPERVISOR_INTERVAL_MS = 30000;
const CONNECTING_STALL_MS = 90000;

export class WhatsAppService {
  public suspendForRestore(): void {
    console.log(`[WhatsApp] suspending instance ${this.instanceId} for restore`);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.autoReconnectBlocked = true;
    if (typeof (this as any).stopConnectionSupervisor === 'function') {
      (this as any).stopConnectionSupervisor();
    }
    this.isStarting = false;
    this.restartInProgress = false;

    try {
      if (this.sock) {
        const oldSock = this.sock;
        try {
          oldSock.ev.removeAllListeners('creds.update');
          oldSock.ev.removeAllListeners('connection.update');
          oldSock.ev.removeAllListeners('messages.upsert');
          oldSock.ev.removeAllListeners('contacts.upsert');
          oldSock.ev.removeAllListeners('contacts.update');
          oldSock.ev.removeAllListeners('messaging-history.set');
        } catch (e) {
          console.warn('[WhatsApp] error removing listeners:', e);
        }
        oldSock.end(undefined);
        this.sock = null;
      }
    } catch (err: any) {
      console.error(`[WhatsApp] error during suspendForRestore for ${this.instanceId}:`, err?.message);
    } finally {
      this.currentQR = null;
      this.currentQRDataUrl = null;
    }
  }


  private sock: WASocket | null = null;
  private io: SocketIOServer | null = null;
  private isStarting: boolean = false;
  private restartInProgress: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private socketGeneration: number = 0;
  private currentStatus: WhatsAppStatus = 'disconnected';
  private currentQR: string | null = null;
  private currentQRDataUrl: string | null = null;
  private lastError: string | null = null;
  private accountInfo: { name: string | null; number: string | null; jid: string | null } = {
    name: null,
    number: null,
    jid: null,
  };
  private connectedAt: string | null = null;
  private messages: ReceivedMessage[] = [];
  private groupCache: Map<string, { data: any; expiresAt: number }> = new Map();
  private groupsListCache: { data: WhatsAppGroup[]; expiresAt: number } | null = null;
  private reconnectAttempt = 0;
  private connectionSupervisorTimer: NodeJS.Timeout | null = null;
  private autoReconnectBlocked = false;
  private lastDisconnectCode: number | null = null;
  private statusChangedAt = Date.now();

  
  public instanceId: string;
  private authDir: string;
  private contactsService: ContactsService;

  constructor(instanceId: string, authDir: string, contactsService: ContactsService) {
    this.instanceId = instanceId;
    this.authDir = authDir;
    this.contactsService = contactsService;
    this.ensureAuthDir();
  }


  private ensureAuthDir() {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  public setSocketIO(io: SocketIOServer) {
    this.io = io;
  }

  private getBestContactName(c: any): string | null {
    if (!c) return null;
    const candidates = [c.name, c.notify, c.verifiedName, c.pushName];
    for (const name of candidates) {
      if (typeof name === 'string' && name.trim().length > 0 && !name.includes('@') && !/^\+?\d+$/.test(name)) {
        return name.trim();
      }
    }
    return null;
  }

  private async processContact(c: any, source: 'contact' | 'chat' | 'message' = 'contact') {
    if (!c?.id) return;
    const bestName = this.getBestContactName(c);
    const hasPhone = !!c.phoneNumber;
    const hasLid = !!c.lid;
    
    if (bestName || hasPhone || hasLid) {
       const resolved = await this.resolvePrivateIdentity(c.id, {
         phoneNumber: c.phoneNumber,
         lid: c.lid
       });
       
       if (resolved.canonicalJid.includes('@s.whatsapp.net') && c.id.includes('@lid')) {
         this.contactsService.reconcileLidMapping(c.id, resolved.canonicalJid, { name: bestName });
       } else {
         this.contactsService.upsertContact({
           jid: resolved.canonicalJid,
           name: bestName,
           source,
           lid: resolved.lid,
           number: resolved.number
         });
       }
    }
  }

  private async resolvePrivateIdentity(
    primaryJid: string,
    hints?: { remoteJidAlt?: string; phoneNumber?: string; lid?: string }
  ): Promise<{ canonicalJid: string; number: string | null; lid: string | null }> {
    const isLid = primaryJid.includes('@lid');
    
    if (!isLid) {
      // It's already a PN or group or broadcast, just return it as is.
      // If it's a standard PN:
      if (primaryJid.includes('@s.whatsapp.net')) {
        return {
          canonicalJid: primaryJid,
          number: primaryJid.split('@')[0].split(':')[0],
          lid: hints?.lid || null
        };
      }
      return { canonicalJid: primaryJid, number: null, lid: null };
    }

    // It's a LID
    // 1. Check for remoteJidAlt
    if (hints?.remoteJidAlt && hints.remoteJidAlt.includes('@s.whatsapp.net')) {
      const pn = hints.remoteJidAlt;
      return {
        canonicalJid: pn,
        number: pn.split('@')[0].split(':')[0],
        lid: primaryJid
      };
    }

    // 2. Check for phoneNumber hint
    if (hints?.phoneNumber) {
      let pnClean = hints.phoneNumber;
      if (pnClean.includes('@s.whatsapp.net')) {
        pnClean = pnClean.split('@')[0].split(':')[0];
      }
      // If it has digits, we extract them
      const digitsOnly = pnClean.replace(/\D/g, '');
      if (digitsOnly.length > 0) {
        const pn = `${digitsOnly}@s.whatsapp.net`;
        return {
          canonicalJid: pn,
          number: digitsOnly,
          lid: primaryJid
        };
      }
    }

    // 3. Fallback to Baileys signalRepository
    if (this.sock?.signalRepository?.lidMapping?.getPNForLID) {
      try {
        const pnFromRepo = await this.sock.signalRepository.lidMapping.getPNForLID(primaryJid);
        if (pnFromRepo) {
          return {
            canonicalJid: pnFromRepo,
            number: pnFromRepo.split('@')[0].split(':')[0],
            lid: primaryJid
          };
        }
      } catch (err) {
        console.warn(`[WhatsApp] Error resolving PN for LID ${primaryJid}:`, err);
      }
    }

    // 4. No mapping found
    return {
      canonicalJid: primaryJid,
      number: null,
      lid: primaryJid
    };
  }

  

  public getState(): WhatsAppAccountInfo {
    return {
      status: this.currentStatus,
      name: this.accountInfo.name,
      number: this.accountInfo.number,
      jid: this.accountInfo.jid,
      qrCode: this.currentQRDataUrl || this.currentQR,
      error: this.lastError,
      connectedAt: this.connectedAt,
    };
  }

  public getMessages(): ReceivedMessage[] {
    return this.messages;
  }

  public getMessagesCount(): number {
    return this.messages.length;
  }

  public async sendTextMessage(
    remoteJid: string,
    text: string
  ): Promise<{ success: boolean; message?: ReceivedMessage; error?: string }> {
    if (!this.sock || this.currentStatus !== 'connected') {
      return { success: false, error: 'WhatsApp não está conectado.' };
    }

    if (!remoteJid || typeof remoteJid !== 'string' || !remoteJid.trim()) {
      return { success: false, error: 'Destinatário inválido.' };
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      return { success: false, error: 'Mensagem não pode estar vazia.' };
    }

    const trimmedText = text.trim();
    const targetJid = remoteJid.trim();
    const rawNumber = targetJid.split('@')[0].split(':')[0];

    // Log before sending: [WhatsApp] sending message to=5593...
    console.log(`[WhatsApp] sending message to=${rawNumber || targetJid}`);

    try {
      // Look up previous pushName from conversation if available
      const existingMsg = this.messages.find((m) => m.remoteJid === targetJid);
      const targetPushName = existingMsg?.pushName || null;

      // Real Baileys send using the connected socket
      const sentResult = await this.sock.sendMessage(targetJid, {
        text: trimmedText,
      });

      const messageId =
        sentResult?.key?.id || `${Date.now()}_out_${Math.random().toString(36).substring(2, 7)}`;
      const timestamp = Date.now();

      const outgoingMessage: ReceivedMessage = {
        id: messageId,
        remoteJid: targetJid,
        number: rawNumber || null,
        pushName: targetPushName,
        text: trimmedText,
        type: 'text',
        timestamp,
        direction: 'outgoing',
      };

      const isGroupTarget = targetJid.endsWith('@g.us');

      // Add to in-memory list ONLY if private chat (limit to 100)
      if (!isGroupTarget) {
        this.messages = [outgoingMessage, ...this.messages].slice(0, MAX_MESSAGES_IN_MEMORY);
      }

      // Save to contacts directory if private chat
      if (!isGroupTarget && !targetJid.includes('@broadcast')) {
        this.contactsService.upsertContact({
          jid: targetJid,
          number: rawNumber || null,
          name: targetPushName,
          source: 'message',
          lastSeenAt: new Date().toISOString(),
          
        });
      }

      // Log after sending: [WhatsApp] message sent to=5593... id=...
      console.log(`[WhatsApp] message sent to=${rawNumber || targetJid} id=${messageId}`);

      // Emit to frontend via Socket.IO ONLY if private chat
      if (this.io && !isGroupTarget) {
        this.io.to(`instance:${this.instanceId}`).emit('whatsapp:message', outgoingMessage);
      }

      return { success: true, message: outgoingMessage };
    } catch (err: any) {
      const errorMsg = err?.message || 'Erro ao enviar mensagem pelo Baileys';
      console.log(`[WhatsApp] send error to=${rawNumber || targetJid} reason=${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  public async sendImageMessage(
    remoteJid: string,
    media: ScheduledMedia,
    caption?: string
  ): Promise<{ success: boolean; message?: ReceivedMessage; error?: string }> {
    if (!this.sock || this.currentStatus !== 'connected') {
      return { success: false, error: 'WhatsApp não está conectado.' };
    }

    if (!remoteJid || typeof remoteJid !== 'string' || !remoteJid.trim()) {
      return { success: false, error: 'Destinatário inválido.' };
    }

    if (!media || media.type !== 'image') {
      return { success: false, error: 'Mídia de imagem inválida.' };
    }

    const targetJid = remoteJid.trim();
    const rawNumber = targetJid.split('@')[0].split(':')[0];
    const trimmedCaption = caption ? caption.trim() : undefined;

    console.log(`[WhatsApp] sending image to=${rawNumber || targetJid}`);

    try {
      let imagePayload: any;

      if (media.source === 'upload') {
        if (!media.localPath || !fs.existsSync(media.localPath)) {
          return { success: false, error: `Arquivo de imagem não encontrado no servidor: ${media.localPath}` };
        }
        imagePayload = fs.readFileSync(media.localPath);
      } else if (media.source === 'url') {
        if (!media.url || !/^https?:\/\//i.test(media.url)) {
          return { success: false, error: `URL de imagem inválida: ${media.url}` };
        }
        imagePayload = { url: media.url };
      } else {
        return { success: false, error: 'Fonte de mídia desconhecida.' };
      }

      // Look up previous pushName from conversation if available
      const existingMsg = this.messages.find((m) => m.remoteJid === targetJid);
      const targetPushName = existingMsg?.pushName || null;

      const messageContent: any = {
        image: imagePayload,
      };

      if (trimmedCaption) {
        messageContent.caption = trimmedCaption;
      }

      // Real Baileys send using connected socket
      const sentResult = await this.sock.sendMessage(targetJid, messageContent);

      const messageId =
        sentResult?.key?.id || `${Date.now()}_out_img_${Math.random().toString(36).substring(2, 7)}`;
      const timestamp = Date.now();

      const outgoingMessage: ReceivedMessage = {
        id: messageId,
        remoteJid: targetJid,
        number: rawNumber || null,
        pushName: targetPushName,
        text: trimmedCaption || '[Imagem]',
        type: 'image',
        timestamp,
        direction: 'outgoing',
      };

      const isGroupTarget = targetJid.endsWith('@g.us');

      // Add to in-memory list ONLY if private chat (limit to 100)
      if (!isGroupTarget) {
        this.messages = [outgoingMessage, ...this.messages].slice(0, MAX_MESSAGES_IN_MEMORY);
      }

      // Save to contacts directory if private chat
      if (!isGroupTarget && !targetJid.includes('@broadcast')) {
        this.contactsService.upsertContact({
          jid: targetJid,
          number: rawNumber || null,
          name: targetPushName,
          source: 'message',
          lastSeenAt: new Date().toISOString(),
        });
      }

      console.log(`[WhatsApp] image sent to=${rawNumber || targetJid} id=${messageId}`);

      // Emit to frontend via Socket.IO ONLY if private chat
      if (this.io && !isGroupTarget) {
        this.io.to(`instance:${this.instanceId}`).emit('whatsapp:message', outgoingMessage);
      }

      return { success: true, message: outgoingMessage };
    } catch (err: any) {
      const errorMsg = err?.message || 'Erro ao enviar imagem pelo Baileys';
      console.log(`[WhatsApp] send image error to=${rawNumber || targetJid} reason=${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  public async getGroups(): Promise<WhatsAppGroup[]> {
    if (!this.sock || this.currentStatus !== 'connected') {
      return [];
    }

    const now = Date.now();
    if (this.groupsListCache && this.groupsListCache.expiresAt > now) {
      return this.groupsListCache.data;
    }

    try {
      const groupsMap = await this.sock.groupFetchAllParticipating();
      const groupsList: WhatsAppGroup[] = Object.values(groupsMap).map((g: any) => ({
        id: g.id,
        subject: g.subject || 'Grupo sem nome',
        participantsCount: Array.isArray(g.participants) ? g.participants.length : (g.size || 0),
        creation: g.creation,
        owner: g.owner,
      }));

      // Sort alphabetically by group name
      groupsList.sort((a, b) => a.subject.localeCompare(b.subject));

      // Cache list for 3 minutes
      this.groupsListCache = {
        data: groupsList,
        expiresAt: now + 180000,
      };

      // Populate groupCache
      for (const g of Object.values(groupsMap)) {
        this.groupCache.set((g as any).id, {
          data: g,
          expiresAt: now + 300000, // 5 min TTL
        });
      }

      return groupsList;
    } catch (err: any) {
      console.error('[WhatsApp] error fetching groups:', err?.message || err);
      return this.groupsListCache?.data || [];
    }
  }

  public async getGroupParticipants(groupJid: string): Promise<GroupParticipantsResponse> {
    if (!this.sock || this.currentStatus !== 'connected') {
      return {
        groupJid,
        groupName: 'Grupo',
        participants: [],
      };
    }

    const now = Date.now();
    let groupMeta: any = null;

    const cached = this.groupCache.get(groupJid);
    if (cached && cached.expiresAt > now) {
      groupMeta = cached.data;
    } else {
      try {
        groupMeta = await this.sock.groupMetadata(groupJid);
        this.groupCache.set(groupJid, {
          data: groupMeta,
          expiresAt: now + 300000, // 5 min TTL
        });
      } catch (err: any) {
        console.error(`[WhatsApp] error fetching group metadata for ${groupJid}:`, err?.message || err);
        return {
          groupJid,
          groupName: 'Grupo',
          participants: [],
        };
      }
    }

    const groupName = groupMeta?.subject || 'Grupo';
    const rawParticipants: any[] = Array.isArray(groupMeta?.participants) ? groupMeta.participants : [];
    const selfJid = this.accountInfo.jid?.toLowerCase();

    const participants: GroupParticipant[] = [];

    for (const p of rawParticipants) {
      const rawId: string = p.id || p.jid || '';
      const isLid = rawId.endsWith('@lid');

      let resolvedJid: string | null = null;
      let number: string | null = null;
      let selectable = true;
      let name: string | null = null;

      if (!isLid && rawId.endsWith('@s.whatsapp.net')) {
        resolvedJid = rawId;
        number = rawId.split('@')[0].split(':')[0];
      } else if (p.phoneNumber && typeof p.phoneNumber === 'string') {
        const cleanNum = p.phoneNumber.replace(/\D/g, '');
        if (cleanNum.length >= 10) {
          resolvedJid = `${cleanNum}@s.whatsapp.net`;
          number = cleanNum;
        }
      }

      if (!resolvedJid) {
        // Telefone não resolvido (e.g. only @lid)
        selectable = false;
        name = 'Telefone não resolvido';
        resolvedJid = rawId || 'unknown@lid';
      } else {
        // If it's the connected account itself
        if (selfJid && (resolvedJid.toLowerCase() === selfJid || selfJid.includes(number || '---'))) {
          name = `${this.accountInfo.name || 'Você'} (Você)`;
        } else {
          // Look up in contactsService
          const known = this.contactsService.getContact(resolvedJid);
          name = p.name || p.notify || known?.name || `+${number}`;
        }
      }

      participants.push({
        jid: resolvedJid,
        number,
        name,
        selectable,
        isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
      });
    }

    return {
      groupJid,
      groupName,
      participants,
    };
  }

  private updateStatus(
    status: WhatsAppStatus,
    extra: Partial<WhatsAppAccountInfo> = {}
  ) {
    this.statusChangedAt = Date.now();
    this.currentStatus = status;
    if (extra.error !== undefined) this.lastError = extra.error;
    if (extra.qrCode !== undefined) {
      this.currentQR = extra.qrCode;
      this.currentQRDataUrl = extra.qrCode;
    }

    const payload = this.getState();
    if (this.io) {
      this.io.to(`instance:${this.instanceId}`).emit('whatsapp:state', payload);
    }
  }

  public async connect(): Promise<void> {
    if (this.isStarting || this.restartInProgress) {
      console.log(`[WhatsApp] start requested - already in progress generation=${this.socketGeneration}`);
      return;
    }

    if (this.currentStatus === 'connected' && this.sock) {
      console.log(`[WhatsApp] start requested - already connected generation=${this.socketGeneration}`);
      return;
    }

    console.log('[WhatsApp] start requested');
    this.autoReconnectBlocked = false;
    this.startConnectionSupervisor();
    this.lastError = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isStarting = true;
    try {
      await this.createSocket();
    } catch (err: any) {
      this.isStarting = false;
      console.log('[WhatsApp] start error:', err?.message || err);
      this.updateStatus('error', { error: err?.message || 'Erro ao inicializar conexão WhatsApp' });
    }
  }

  private async createSocket(): Promise<void> {
    this.socketGeneration++;
    const currentGen = this.socketGeneration;
    console.log(`[WhatsApp] socket created generation=${currentGen}`);

    if (this.currentStatus !== 'authenticated') {
      this.updateStatus('connecting', { error: null });
    }

    this.ensureAuthDir();
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const logger = pino({ level: 'silent' });

    // Clean up previous socket listeners if existing
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('messages.upsert');
      } catch {}
      this.sock = null;
    }

    // Initialize Baileys using standard default version
    this.sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['North Code Zap', 'Chrome', '1.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      cachedGroupMetadata: async (jid: string) => {
        const cached = this.groupCache.get(jid);
        if (cached && cached.expiresAt > Date.now()) {
          return cached.data;
        }
        try {
          const meta = await this.sock?.groupMetadata(jid);
          if (meta) {
            this.groupCache.set(jid, { data: meta, expiresAt: Date.now() + 300000 });
          }
          return meta;
        } catch {
          return undefined;
        }
      },
    });

    // Handle creds update
    this.sock.ev.on('creds.update', async () => {
      console.log(`[WhatsApp] credentials updated generation=${currentGen}`);
      await saveCreds();
    });

    // Handle messages upsert (Real-time message receiving)
    this.sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
      if (currentGen !== this.socketGeneration) {
        console.log(`[WhatsApp] ignoring messages.upsert from stale socket generation ${currentGen}`);
        return;
      }

      if (!newMessages || newMessages.length === 0) return;

      for (const msg of newMessages) {
        // Filter 1: Ignore messages sent by me
        if (msg.key?.fromMe) {
          continue;
        }

        const remoteJid = msg.key?.remoteJid || '';

        // Filter 2: Ignore status broadcasts and empty JIDs
        if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.includes('@broadcast')) {
          continue;
        }

        // Extract message ID
        const messageId = msg.key?.id || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Check if message already exists in memory
        if (this.messages.some((m) => m.id === messageId)) {
          continue;
        }

        // Resolve private identity
        const isGroupTarget = remoteJid.endsWith('@g.us');
        let finalRemoteJid = remoteJid;
        let finalNumber = remoteJid.split('@')[0].split(':')[0];

        if (!isGroupTarget) {
          const resolved = await this.resolvePrivateIdentity(remoteJid, {
            remoteJidAlt: msg.key?.remoteJidAlt
          });
          finalRemoteJid = resolved.canonicalJid;
          finalNumber = resolved.number || '';
        }
        
        const pushName = msg.pushName || null;

        // Extract text and determine message type
        let text = '';
        let messageType = 'text';

        if (msg.message?.conversation) {
          text = msg.message.conversation;
          messageType = 'text';
        } else if (msg.message?.extendedTextMessage?.text) {
          text = msg.message.extendedTextMessage.text;
          messageType = 'text';
        } else if (msg.message?.imageMessage) {
          text = msg.message.imageMessage.caption || '[Imagem]';
          messageType = 'image';
        } else if (msg.message?.videoMessage) {
          text = msg.message.videoMessage.caption || '[Vídeo]';
          messageType = 'video';
        } else if (msg.message?.audioMessage) {
          text = '[Áudio]';
          messageType = 'audio';
        } else if (msg.message?.documentMessage) {
          text = msg.message.documentMessage.fileName ? `[Documento: ${msg.message.documentMessage.fileName}]` : '[Documento]';
          messageType = 'document';
        } else if (msg.message?.stickerMessage) {
          text = '[Sticker]';
          messageType = 'sticker';
        } else if (msg.message?.contactMessage) {
          text = '[Contato]';
          messageType = 'contact';
        } else if (msg.message?.locationMessage) {
          text = '[Localização]';
          messageType = 'location';
        } else {
          text = '[Mensagem]';
          messageType = 'other';
        }

        // Extract timestamp (Baileys provides seconds in messageTimestamp)
        let timestamp = Date.now();
        if (typeof msg.messageTimestamp === 'number') {
          timestamp = msg.messageTimestamp * 1000;
        } else if (typeof msg.messageTimestamp === 'object' && msg.messageTimestamp !== null) {
          timestamp = Number(msg.messageTimestamp) * 1000;
        }

        const receivedMessage: ReceivedMessage = {
          id: messageId,
          remoteJid: finalRemoteJid,
          number: finalNumber || null,
          pushName,
          text,
          type: messageType,
          timestamp,
          direction: 'incoming',
        };

        const isGroupMessage = finalRemoteJid.endsWith('@g.us');

        // Add to memory list ONLY if private chat
        if (!isGroupMessage && !finalRemoteJid.includes('@broadcast')) {
          this.messages = [receivedMessage, ...this.messages].slice(0, MAX_MESSAGES_IN_MEMORY);
        }

        // Record contact in Contacts Directory
        if (!isGroupMessage && !finalRemoteJid.includes('@broadcast')) {
          if (finalRemoteJid !== remoteJid && remoteJid.includes('@lid')) {
            this.contactsService.reconcileLidMapping(remoteJid, finalRemoteJid, {
              name: pushName,
              lastSeenAt: new Date(timestamp).toISOString()
            });
          } else {
            this.contactsService.upsertContact({
              jid: finalRemoteJid,
              number: finalNumber || null,
              name: pushName,
              source: 'message',
              lastSeenAt: new Date(timestamp).toISOString(),
              lid: remoteJid.includes('@lid') ? remoteJid : undefined
            });
          }
        }

        // Required diagnostic log: [WhatsApp] message received from=5593... type=text
        console.log(`[WhatsApp] message received from=${finalNumber || finalRemoteJid} type=${messageType}${isGroupMessage ? ' (group)' : ''}`);

        // Emit to frontend via Socket.IO ONLY if private chat
        if (this.io && !isGroupMessage && !finalRemoteJid.includes('@broadcast')) {
          this.io.to(`instance:${this.instanceId}`).emit('whatsapp:message', receivedMessage);
        }
      }
    });

    // Handle contacts upsert/update
    this.sock.ev.on('contacts.upsert', async (newContacts: any[]) => {
      if (Array.isArray(newContacts)) {
        for (const c of newContacts) {
          await this.processContact(c, 'contact');
        }
      }
    });

    this.sock.ev.on('contacts.update', async (updates: any[]) => {
      if (Array.isArray(updates)) {
        for (const c of updates) {
          await this.processContact(c, 'contact');
        }
      }
    });

    // Handle messaging-history.set (Initial sync of contacts and chats)
    this.sock.ev.on('messaging-history.set', async (payload: any) => {
      const { contacts: histContacts, chats: histChats, lidPnMappings } = payload;
      
      if (Array.isArray(lidPnMappings)) {
        for (const mapping of lidPnMappings) {
          if (mapping.lid && mapping.pn) {
            this.contactsService.reconcileLidMapping(mapping.lid, mapping.pn);
          }
        }
      }
      
      if (Array.isArray(histContacts)) {
        for (const c of histContacts) {
          await this.processContact(c, 'contact');
        }
      }

      if (Array.isArray(histChats)) {
        for (const ch of histChats) {
          if (ch?.id && !ch.id.endsWith('@g.us') && !ch.id.includes('@broadcast')) {
            this.contactsService.upsertContact({
              jid: ch.id,
              name: ch.name || null,
              source: 'chat',
            });
          }
        }
      }
    });

    // Handle connection updates
    this.sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      if (currentGen !== this.socketGeneration) {
        console.log(`[WhatsApp] ignoring event from stale socket generation ${currentGen} (active: ${this.socketGeneration})`);
        return;
      }

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`[WhatsApp] qr generated generation=${currentGen}`);
        this.currentQR = qr;
        try {
          this.currentQRDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 320,
            color: {
              dark: '#000000',
              light: '#FFFFFF',
            },
          });
        } catch (err) {
          console.error('[WhatsApp] error generating qr data url:', err);
          this.currentQRDataUrl = null;
        }
        this.updateStatus('qr', { qrCode: this.currentQRDataUrl, error: null });
      }

      if (connection === 'connecting') {
        console.log(`[WhatsApp] connecting generation=${currentGen}`);
        if (this.currentStatus !== 'qr' && this.currentStatus !== 'authenticated') {
          this.updateStatus('connecting');
        }
      }

      if (connection === 'open') {
        console.log(`[WhatsApp] connected generation=${currentGen}`);
        this.isStarting = false;
        this.restartInProgress = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.currentQR = null;
        this.currentQRDataUrl = null;
        this.lastError = null;

        this.reconnectAttempt = 0;
        this.lastDisconnectCode = null;
        this.autoReconnectBlocked = false;

        const userJid = this.sock?.user?.id || '';
        const rawNumber = userJid.split(':')[0].split('@')[0];
        const userName = this.sock?.user?.name || this.sock?.user?.notify || 'WhatsApp User';

        this.accountInfo = {
          name: userName,
          number: rawNumber || null,
          jid: userJid || null,
        };
        this.connectedAt = new Date().toISOString();

        this.updateStatus('connected', { qrCode: null, error: null });
        this.startConnectionSupervisor();
      }

      if (connection === 'close') {
        this.isStarting = false;
        const boomError = lastDisconnect?.error as any;
        const statusCode = boomError?.output?.statusCode ?? boomError?.statusCode ?? (lastDisconnect?.error as any)?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || 'Connection closed';
        this.lastDisconnectCode = statusCode ?? null;

        console.log(`[WhatsApp] disconnected code=${statusCode} reason=${errorMessage} generation=${currentGen}`);

        // 1. RESTART REQUIRED (515) - Expected after QR scan pairing
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log(`[WhatsApp] restart required after pairing generation=${currentGen}`);
          this.currentQR = null;
          this.currentQRDataUrl = null;
          this.updateStatus('connecting', { qrCode: null, error: null });
          this.restartWhatsAppConnection();
          return;
        }

        // 2. LOGGED OUT (401)
        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          console.log(`[WhatsApp] disconnected loggedOut (401) generation=${currentGen}`);
          this.autoReconnectBlocked = true;
          this.reconnectAttempt = 0;
          this.clearReconnectTimer();
          this.stopConnectionSupervisor();
          this.restartInProgress = false;
          this.clearSessionFiles();
          this.accountInfo = { name: null, number: null, jid: null };
          this.currentQR = null;
          this.currentQRDataUrl = null;
          this.updateStatus('disconnected', { error: 'Desconectado do WhatsApp.' });
          return;
        }

        // 3. TRANSIENT DROPS (408 timedOut, 428 connectionClosed, 503 unavailable)
        if (this.isTransientDisconnectCode(statusCode)) {
          const delay = this.getReconnectDelay();
          this.reconnectAttempt++;
          console.log(`[WhatsApp] transient disconnect code=${statusCode} attempt=${this.reconnectAttempt} reconnectIn=${delay}ms generation=${currentGen}`);
          this.updateStatus('connecting', { error: null });
          this.restartWhatsAppConnection(delay);
          return;
        }

        // 4. OTHER ERRORS
        this.autoReconnectBlocked = true;
        this.reconnectAttempt = 0;
        this.clearReconnectTimer();
        this.stopConnectionSupervisor();
        
        this.restartInProgress = false;
        this.updateStatus('error', {
          error: statusCode ? `Conexão encerrada (código ${statusCode})` : errorMessage,
        });
      }
    });
  }

  private async restartWhatsAppConnection(delayMs = 0): Promise<void> {
    if (this.restartInProgress) {
      console.log(`[WhatsApp] restart already in progress generation=${this.socketGeneration}`);
      return;
    }
    this.restartInProgress = true;
    this.isStarting = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const doRestart = async () => {
      this.reconnectTimer = null;
      if (this.autoReconnectBlocked) {
        console.log('[WhatsApp] reconnect cancelled because auto reconnect is blocked');
        this.restartInProgress = false;
        return;
      }
      try {
        console.log(`[WhatsApp] recreating socket generation=${this.socketGeneration + 1}`);
        await this.createSocket();
      } catch (err: any) {
        console.log(`[WhatsApp] error recreating socket: ${err?.message || err}`);
        this.restartInProgress = false;
        if (!this.autoReconnectBlocked && this.hasSavedSession()) {
          const nextDelay = this.getReconnectDelay();
          this.reconnectAttempt++;
          console.log(`[WhatsApp] reconnect attempt failed scheduling next in ${nextDelay}ms`);
          this.reconnectTimer = null;
          this.restartWhatsAppConnection(nextDelay);
        } else {
          this.updateStatus('error', { error: err?.message || 'Erro ao recriar conexão WhatsApp' });
        }
      } finally {
        this.restartInProgress = false;
      }
    };

    if (delayMs > 0) {
      this.reconnectTimer = setTimeout(doRestart, delayMs);
    } else {
      await doRestart();
    }
  }

  public async disconnect(clearSession: boolean = true): Promise<void> {
    console.log('[WhatsApp] disconnecting requested by user');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.autoReconnectBlocked = true;
    this.reconnectAttempt = 0;
    this.stopConnectionSupervisor();
    this.isStarting = false;
    this.restartInProgress = false;

    try {
      if (this.sock) {
        try {
          await this.sock.logout();
        } catch {
          this.sock.end(undefined);
        }
        this.sock = null;
      }
    } catch (err: any) {
      console.error('[WhatsApp] error during disconnect:', err?.message);
    } finally {
      this.currentQR = null;
      this.currentQRDataUrl = null;
      this.accountInfo = { name: null, number: null, jid: null };
      this.connectedAt = null;

      if (clearSession) {
        this.clearSessionFiles();
      }

      this.updateStatus('disconnected', { error: null, qrCode: null });
    }
  }

  private clearSessionFiles() {
    try {
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        fs.mkdirSync(this.authDir, { recursive: true });
        console.log('[WhatsApp] auth directory cleared');
      }
    } catch (err: any) {
      console.error('[WhatsApp] error clearing auth dir:', err?.message);
    }
  }

  private hasSavedSession(): boolean {
    return fs.existsSync(path.join(this.authDir, 'creds.json'));
  }

  private isTransientDisconnectCode(statusCode: number | undefined | null): boolean {
    return statusCode === DisconnectReason.connectionClosed ||
           statusCode === DisconnectReason.connectionLost ||
           statusCode === DisconnectReason.timedOut ||
           statusCode === 503;
  }

  private getReconnectDelay(): number {
    const index = Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1);
    return RECONNECT_BACKOFF_MS[index];
  }

  private startConnectionSupervisor() {
    if (this.connectionSupervisorTimer) return;
    this.connectionSupervisorTimer = setInterval(() => {
      if (this.autoReconnectBlocked) return;
      if (!this.hasSavedSession()) return;
      
      const currentStatus = this.currentStatus;
      if (currentStatus === 'connected') return;
      if (this.isStarting || this.restartInProgress || this.reconnectTimer) return;

      let shouldRecover = false;

      if (currentStatus === 'error' && this.isTransientDisconnectCode(this.lastDisconnectCode)) {
        shouldRecover = true;
      } else if (currentStatus === 'disconnected' && !this.autoReconnectBlocked && this.hasSavedSession()) {
        shouldRecover = true;
      } else if (currentStatus === 'connecting' && Date.now() - this.statusChangedAt > CONNECTING_STALL_MS) {
        shouldRecover = true;
      }

      if (shouldRecover) {
        console.log(`[WhatsApp] supervisor requesting recovery status=${currentStatus} code=${this.lastDisconnectCode}`);
        const delay = this.getReconnectDelay();
        this.reconnectAttempt++;
        this.restartWhatsAppConnection(delay);
      }
    }, CONNECTION_SUPERVISOR_INTERVAL_MS);
    this.connectionSupervisorTimer.unref?.();
  }

  private stopConnectionSupervisor() {
    if (this.connectionSupervisorTimer) {
      clearInterval(this.connectionSupervisorTimer);
      this.connectionSupervisorTimer = null;
    }
  }

  public ensureConnected(reason = 'external'): boolean {
    if (this.currentStatus === 'connected') return true;
    if (this.autoReconnectBlocked) return false;
    if (!this.hasSavedSession()) return false;
    if (this.isStarting || this.restartInProgress || this.reconnectTimer) return false;

    let recoverable = false;

    if (this.currentStatus === 'disconnected') {
      recoverable = true;
    } else if (
      this.currentStatus === 'error' &&
      this.isTransientDisconnectCode(this.lastDisconnectCode)
    ) {
      recoverable = true;
    } else if (
      this.currentStatus === 'connecting' &&
      Date.now() - this.statusChangedAt > CONNECTING_STALL_MS
    ) {
      recoverable = true;
    }

    if (!recoverable) {
      console.log(`[WhatsApp] ensureConnected ignored reason=${reason} status=${this.currentStatus} code=${this.lastDisconnectCode}`);
      return false;
    }

    console.log(`[WhatsApp] ensureConnected requested reason=${reason} status=${this.currentStatus}`);
    const delay = this.getReconnectDelay();
    this.reconnectAttempt++;
    this.restartWhatsAppConnection(delay);
    return false;
  }

  public clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

}
