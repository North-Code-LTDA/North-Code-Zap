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

const AUTH_DIR = process.env.AUTH_DIR || path.join(process.cwd(), 'data', 'auth');

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
