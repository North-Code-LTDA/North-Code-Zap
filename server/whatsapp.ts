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
import { contactsService } from './contacts';
import type {
  GroupParticipant,
  GroupParticipantsResponse,
  WhatsAppStatus,
  WhatsAppAccountInfo,
  WhatsAppGroup,
  ReceivedMessage,
  ScheduledMedia,
} from '../src/types';

const AUTH_DIR = process.env.AUTH_DIR || path.join(process.cwd(), 'data', 'auth');
const MAX_MESSAGES_IN_MEMORY = 100;

export class WhatsAppService {
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

  constructor() {
    this.ensureAuthDir();
  }

  private ensureAuthDir() {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
  }

  public setSocketIO(io: SocketIOServer) {
    this.io = io;
    this.setupSocketEvents();
  }

  private setupSocketEvents() {
    if (!this.io) return;

    this.io.on('connection', (clientSocket) => {
      // Send current state to newly connected frontend client ONLY (do not start WhatsApp)
      clientSocket.emit('whatsapp:state', this.getState());

      clientSocket.on('whatsapp:get_state', () => {
        clientSocket.emit('whatsapp:state', this.getState());
      });

      clientSocket.on('whatsapp:get_messages', () => {
        clientSocket.emit('whatsapp:messages_list', this.messages);
      });
    });
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
        contactsService.upsertContact({
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
        this.io.emit('whatsapp:message', outgoingMessage);
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
        contactsService.upsertContact({
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
        this.io.emit('whatsapp:message', outgoingMessage);
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
          const known = contactsService.getContact(resolvedJid);
          name = p.name || p.notify || known?.name || `+${number}`;
          if (name && !name.startsWith('+')) {
            contactsService.upsertContact({
              jid: resolvedJid,
              number,
              name,
              source: 'contact',
            });
          }
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
    this.currentStatus = status;
    if (extra.error !== undefined) this.lastError = extra.error;
    if (extra.qrCode !== undefined) {
      this.currentQR = extra.qrCode;
      this.currentQRDataUrl = extra.qrCode;
    }

    const payload = this.getState();
    if (this.io) {
      this.io.emit('whatsapp:state', payload);
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
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
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

        // Extract sender phone number from remoteJid (handles standard and group participants if available)
        const rawNumber = remoteJid.split('@')[0].split(':')[0];
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
          remoteJid,
          number: rawNumber || null,
          pushName,
          text,
          type: messageType,
          timestamp,
          direction: 'incoming',
        };

        const isGroupMessage = remoteJid.endsWith('@g.us');

        // Add to memory list ONLY if private chat
        if (!isGroupMessage && !remoteJid.includes('@broadcast')) {
          this.messages = [receivedMessage, ...this.messages].slice(0, MAX_MESSAGES_IN_MEMORY);
        }

        // Record contact in Contacts Directory
        if (!isGroupMessage && !remoteJid.includes('@broadcast')) {
          contactsService.upsertContact({
            jid: remoteJid,
            number: rawNumber || null,
            name: pushName,
            source: 'message',
            lastSeenAt: new Date(timestamp).toISOString(),
          });
        } else if (msg.key?.participant) {
          // If in a group, also record individual sender contact if known
          const partJid = msg.key.participant;
          const partNum = partJid.split('@')[0].split(':')[0];
          contactsService.upsertContact({
            jid: partJid,
            number: partNum || null,
            name: pushName,
            source: 'message',
            lastSeenAt: new Date(timestamp).toISOString(),
          });
        }

        // Required diagnostic log: [WhatsApp] message received from=5593... type=text
        console.log(`[WhatsApp] message received from=${rawNumber || remoteJid} type=${messageType}${isGroupMessage ? ' (group)' : ''}`);

        // Emit to frontend via Socket.IO ONLY if private chat
        if (this.io && !isGroupMessage && !remoteJid.includes('@broadcast')) {
          this.io.emit('whatsapp:message', receivedMessage);
        }
      }
    });

    // Handle contacts upsert/update
    this.sock.ev.on('contacts.upsert', (newContacts: any[]) => {
      if (Array.isArray(newContacts)) {
        for (const c of newContacts) {
          if (c?.id) {
            contactsService.upsertContact({
              jid: c.id,
              name: c.name || c.notify || null,
              source: 'contact',
            });
          }
        }
      }
    });

    this.sock.ev.on('contacts.update', (updates: any[]) => {
      if (Array.isArray(updates)) {
        for (const c of updates) {
          if (c?.id) {
            contactsService.upsertContact({
              jid: c.id,
              name: c.name || c.notify || null,
              source: 'contact',
            });
          }
        }
      }
    });

    // Handle messaging-history.set (Initial sync of contacts and chats)
    this.sock.ev.on('messaging-history.set', ({ contacts: histContacts, chats: histChats }: any) => {
      if (Array.isArray(histContacts)) {
        for (const c of histContacts) {
          if (c?.id) {
            contactsService.upsertContact({
              jid: c.id,
              name: c.name || c.notify || null,
              source: 'history',
            });
          }
        }
      }
      if (Array.isArray(histChats)) {
        for (const ch of histChats) {
          if (ch?.id && !ch.id.endsWith('@g.us') && !ch.id.includes('@broadcast')) {
            contactsService.upsertContact({
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
      }

      if (connection === 'close') {
        this.isStarting = false;
        const boomError = lastDisconnect?.error as any;
        const statusCode = boomError?.output?.statusCode ?? boomError?.statusCode ?? (lastDisconnect?.error as any)?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || 'Connection closed';

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
          this.restartInProgress = false;
          this.clearSessionFiles();
          this.accountInfo = { name: null, number: null, jid: null };
          this.currentQR = null;
          this.currentQRDataUrl = null;
          this.updateStatus('disconnected', { error: 'Desconectado do WhatsApp.' });
          return;
        }

        // 3. TRANSIENT DROPS (408 timedOut, 428 connectionClosed, 503 unavailable)
        if (
          statusCode === DisconnectReason.connectionClosed ||
          statusCode === DisconnectReason.connectionLost ||
          statusCode === DisconnectReason.timedOut
        ) {
          console.log(`[WhatsApp] connection closed/lost (code=${statusCode}) generation=${currentGen}, scheduling 1 controlled reconnect...`);
          this.updateStatus('connecting', { error: null });
          this.restartWhatsAppConnection(2000);
          return;
        }

        // 4. OTHER ERRORS
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
      try {
        console.log(`[WhatsApp] recreating socket generation=${this.socketGeneration + 1}`);
        await this.createSocket();
      } catch (err: any) {
        console.log(`[WhatsApp] error recreating socket: ${err?.message || err}`);
        this.restartInProgress = false;
        this.updateStatus('error', { error: err?.message || 'Erro ao recriar conexão WhatsApp' });
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
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        console.log('[WhatsApp] auth directory cleared');
      }
    } catch (err: any) {
      console.error('[WhatsApp] error clearing auth dir:', err?.message);
    }
  }
}

export const whatsAppService = new WhatsAppService();
