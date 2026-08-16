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

export type WhatsAppStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'authenticated'
  | 'connected'
  | 'error';

export interface WhatsAppAccountInfo {
  name: string | null;
  number: string | null;
  jid: string | null;
  status: WhatsAppStatus;
  qrCode: string | null;
  error?: string | null;
  connectedAt?: string | null;
}

export interface ReceivedMessage {
  id: string;
  remoteJid: string;
  number: string | null;
  pushName: string | null;
  text: string;
  type: string;
  timestamp: number;
}

const AUTH_DIR = process.env.AUTH_DIR || path.join(process.cwd(), 'data', 'auth');
const MAX_MESSAGES_IN_MEMORY = 100;

class WhatsAppService {
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
        };

        // Add to memory list (limit to 100)
        this.messages = [receivedMessage, ...this.messages].slice(0, MAX_MESSAGES_IN_MEMORY);

        // Required diagnostic log: [WhatsApp] message received from=5593... type=text
        console.log(`[WhatsApp] message received from=${rawNumber || remoteJid} type=${messageType}`);

        // Emit to frontend via Socket.IO
        if (this.io) {
          this.io.emit('whatsapp:message', receivedMessage);
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
