// server/instances.ts
import fs5 from "fs";
import path5 from "path";
import crypto2 from "crypto";

// server/whatsapp.ts
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
var MAX_MESSAGES_IN_MEMORY = 100;
var RECONNECT_BACKOFF_MS = [2e3, 5e3, 1e4, 2e4, 3e4, 6e4];
var CONNECTION_SUPERVISOR_INTERVAL_MS = 3e4;
var CONNECTING_STALL_MS = 9e4;
var WhatsAppService = class {
  constructor(instanceId, authDir, contactsService) {
    this.sock = null;
    this.io = null;
    this.isStarting = false;
    this.restartInProgress = false;
    this.reconnectTimer = null;
    this.socketGeneration = 0;
    this.currentStatus = "disconnected";
    this.currentQR = null;
    this.currentQRDataUrl = null;
    this.lastError = null;
    this.accountInfo = {
      name: null,
      number: null,
      jid: null
    };
    this.connectedAt = null;
    this.messages = [];
    this.groupCache = /* @__PURE__ */ new Map();
    this.groupsListCache = null;
    this.reconnectAttempt = 0;
    this.connectionSupervisorTimer = null;
    this.autoReconnectBlocked = false;
    this.lastDisconnectCode = null;
    this.statusChangedAt = Date.now();
    this.instanceId = instanceId;
    this.authDir = authDir;
    this.contactsService = contactsService;
    this.ensureAuthDir();
  }
  suspendForRestore() {
    console.log(`[WhatsApp] suspending instance ${this.instanceId} for restore`);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.autoReconnectBlocked = true;
    if (typeof this.stopConnectionSupervisor === "function") {
      this.stopConnectionSupervisor();
    }
    this.isStarting = false;
    this.restartInProgress = false;
    try {
      if (this.sock) {
        const oldSock = this.sock;
        try {
          oldSock.ev.removeAllListeners("creds.update");
          oldSock.ev.removeAllListeners("connection.update");
          oldSock.ev.removeAllListeners("messages.upsert");
          oldSock.ev.removeAllListeners("contacts.upsert");
          oldSock.ev.removeAllListeners("contacts.update");
          oldSock.ev.removeAllListeners("messaging-history.set");
        } catch (e) {
          console.warn("[WhatsApp] error removing listeners:", e);
        }
        oldSock.end(void 0);
        this.sock = null;
      }
    } catch (err) {
      console.error(`[WhatsApp] error during suspendForRestore for ${this.instanceId}:`, err?.message);
    } finally {
      this.currentQR = null;
      this.currentQRDataUrl = null;
    }
  }
  ensureAuthDir() {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }
  setSocketIO(io) {
    this.io = io;
  }
  getState() {
    return {
      status: this.currentStatus,
      name: this.accountInfo.name,
      number: this.accountInfo.number,
      jid: this.accountInfo.jid,
      qrCode: this.currentQRDataUrl || this.currentQR,
      error: this.lastError,
      connectedAt: this.connectedAt
    };
  }
  getMessages() {
    return this.messages;
  }
  getMessagesCount() {
    return this.messages.length;
  }
  async sendTextMessage(remoteJid, text) {
    if (!this.sock || this.currentStatus !== "connected") {
      return { success: false, error: "WhatsApp n\xE3o est\xE1 conectado." };
    }
    if (!remoteJid || typeof remoteJid !== "string" || !remoteJid.trim()) {
      return { success: false, error: "Destinat\xE1rio inv\xE1lido." };
    }
    if (!text || typeof text !== "string" || !text.trim()) {
      return { success: false, error: "Mensagem n\xE3o pode estar vazia." };
    }
    const trimmedText = text.trim();
    const targetJid = remoteJid.trim();
    const rawNumber = targetJid.split("@")[0].split(":")[0];
    console.log(`[WhatsApp] sending message to=${rawNumber || targetJid}`);
    try {
      const existingMsg = this.messages.find((m) => m.remoteJid === targetJid);
      const targetPushName = existingMsg?.pushName || null;
      const sentResult = await this.sock.sendMessage(targetJid, {
        text: trimmedText
      });
      const messageId = sentResult?.key?.id || `${Date.now()}_out_${Math.random().toString(36).substring(2, 7)}`;
      const timestamp = Date.now();
      const outgoingMessage = {
        id: messageId,
        remoteJid: targetJid,
        number: rawNumber || null,
        pushName: targetPushName,
        text: trimmedText,
        type: "text",
        timestamp,
        direction: "outgoing"
      };
      const isGroupTarget = targetJid.endsWith("@g.us");
      if (!isGroupTarget) {
        this.messages = [outgoingMessage, ...this.messages].slice(0, MAX_MESSAGES_IN_MEMORY);
      }
      if (!isGroupTarget && !targetJid.includes("@broadcast")) {
        this.contactsService.upsertContact({
          jid: targetJid,
          number: rawNumber || null,
          name: targetPushName,
          source: "message",
          lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      console.log(`[WhatsApp] message sent to=${rawNumber || targetJid} id=${messageId}`);
      if (this.io && !isGroupTarget) {
        this.io.to(`instance:${this.instanceId}`).emit("whatsapp:message", outgoingMessage);
      }
      return { success: true, message: outgoingMessage };
    } catch (err) {
      const errorMsg = err?.message || "Erro ao enviar mensagem pelo Baileys";
      console.log(`[WhatsApp] send error to=${rawNumber || targetJid} reason=${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
  async sendImageMessage(remoteJid, media, caption) {
    if (!this.sock || this.currentStatus !== "connected") {
      return { success: false, error: "WhatsApp n\xE3o est\xE1 conectado." };
    }
    if (!remoteJid || typeof remoteJid !== "string" || !remoteJid.trim()) {
      return { success: false, error: "Destinat\xE1rio inv\xE1lido." };
    }
    if (!media || media.type !== "image") {
      return { success: false, error: "M\xEDdia de imagem inv\xE1lida." };
    }
    const targetJid = remoteJid.trim();
    const rawNumber = targetJid.split("@")[0].split(":")[0];
    const trimmedCaption = caption ? caption.trim() : void 0;
    console.log(`[WhatsApp] sending image to=${rawNumber || targetJid}`);
    try {
      let imagePayload;
      if (media.source === "upload") {
        if (!media.localPath || !fs.existsSync(media.localPath)) {
          return { success: false, error: `Arquivo de imagem n\xE3o encontrado no servidor: ${media.localPath}` };
        }
        imagePayload = fs.readFileSync(media.localPath);
      } else if (media.source === "url") {
        if (!media.url || !/^https?:\/\//i.test(media.url)) {
          return { success: false, error: `URL de imagem inv\xE1lida: ${media.url}` };
        }
        imagePayload = { url: media.url };
      } else {
        return { success: false, error: "Fonte de m\xEDdia desconhecida." };
      }
      const existingMsg = this.messages.find((m) => m.remoteJid === targetJid);
      const targetPushName = existingMsg?.pushName || null;
      const messageContent = {
        image: imagePayload
      };
      if (trimmedCaption) {
        messageContent.caption = trimmedCaption;
      }
      const sentResult = await this.sock.sendMessage(targetJid, messageContent);
      const messageId = sentResult?.key?.id || `${Date.now()}_out_img_${Math.random().toString(36).substring(2, 7)}`;
      const timestamp = Date.now();
      const outgoingMessage = {
        id: messageId,
        remoteJid: targetJid,
        number: rawNumber || null,
        pushName: targetPushName,
        text: trimmedCaption || "[Imagem]",
        type: "image",
        timestamp,
        direction: "outgoing"
      };
      const isGroupTarget = targetJid.endsWith("@g.us");
      if (!isGroupTarget) {
        this.messages = [outgoingMessage, ...this.messages].slice(0, MAX_MESSAGES_IN_MEMORY);
      }
      if (!isGroupTarget && !targetJid.includes("@broadcast")) {
        this.contactsService.upsertContact({
          jid: targetJid,
          number: rawNumber || null,
          name: targetPushName,
          source: "message",
          lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      console.log(`[WhatsApp] image sent to=${rawNumber || targetJid} id=${messageId}`);
      if (this.io && !isGroupTarget) {
        this.io.to(`instance:${this.instanceId}`).emit("whatsapp:message", outgoingMessage);
      }
      return { success: true, message: outgoingMessage };
    } catch (err) {
      const errorMsg = err?.message || "Erro ao enviar imagem pelo Baileys";
      console.log(`[WhatsApp] send image error to=${rawNumber || targetJid} reason=${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
  async getGroups() {
    if (!this.sock || this.currentStatus !== "connected") {
      return [];
    }
    const now = Date.now();
    if (this.groupsListCache && this.groupsListCache.expiresAt > now) {
      return this.groupsListCache.data;
    }
    try {
      const groupsMap = await this.sock.groupFetchAllParticipating();
      const groupsList = Object.values(groupsMap).map((g) => ({
        id: g.id,
        subject: g.subject || "Grupo sem nome",
        participantsCount: Array.isArray(g.participants) ? g.participants.length : g.size || 0,
        creation: g.creation,
        owner: g.owner
      }));
      groupsList.sort((a, b) => a.subject.localeCompare(b.subject));
      this.groupsListCache = {
        data: groupsList,
        expiresAt: now + 18e4
      };
      for (const g of Object.values(groupsMap)) {
        this.groupCache.set(g.id, {
          data: g,
          expiresAt: now + 3e5
          // 5 min TTL
        });
      }
      return groupsList;
    } catch (err) {
      console.error("[WhatsApp] error fetching groups:", err?.message || err);
      return this.groupsListCache?.data || [];
    }
  }
  async getGroupParticipants(groupJid) {
    if (!this.sock || this.currentStatus !== "connected") {
      return {
        groupJid,
        groupName: "Grupo",
        participants: []
      };
    }
    const now = Date.now();
    let groupMeta = null;
    const cached = this.groupCache.get(groupJid);
    if (cached && cached.expiresAt > now) {
      groupMeta = cached.data;
    } else {
      try {
        groupMeta = await this.sock.groupMetadata(groupJid);
        this.groupCache.set(groupJid, {
          data: groupMeta,
          expiresAt: now + 3e5
          // 5 min TTL
        });
      } catch (err) {
        console.error(`[WhatsApp] error fetching group metadata for ${groupJid}:`, err?.message || err);
        return {
          groupJid,
          groupName: "Grupo",
          participants: []
        };
      }
    }
    const groupName = groupMeta?.subject || "Grupo";
    const rawParticipants = Array.isArray(groupMeta?.participants) ? groupMeta.participants : [];
    const selfJid = this.accountInfo.jid?.toLowerCase();
    const participants = [];
    for (const p of rawParticipants) {
      const rawId = p.id || p.jid || "";
      const isLid = rawId.endsWith("@lid");
      let resolvedJid = null;
      let number = null;
      let selectable = true;
      let name = null;
      if (!isLid && rawId.endsWith("@s.whatsapp.net")) {
        resolvedJid = rawId;
        number = rawId.split("@")[0].split(":")[0];
      } else if (p.phoneNumber && typeof p.phoneNumber === "string") {
        const cleanNum = p.phoneNumber.replace(/\D/g, "");
        if (cleanNum.length >= 10) {
          resolvedJid = `${cleanNum}@s.whatsapp.net`;
          number = cleanNum;
        }
      }
      if (!resolvedJid) {
        selectable = false;
        name = "Telefone n\xE3o resolvido";
        resolvedJid = rawId || "unknown@lid";
      } else {
        if (selfJid && (resolvedJid.toLowerCase() === selfJid || selfJid.includes(number || "---"))) {
          name = `${this.accountInfo.name || "Voc\xEA"} (Voc\xEA)`;
        } else {
          const known = this.contactsService.getContact(resolvedJid);
          name = p.name || p.notify || known?.name || `+${number}`;
        }
      }
      participants.push({
        jid: resolvedJid,
        number,
        name,
        selectable,
        isAdmin: p.admin === "admin" || p.admin === "superadmin"
      });
    }
    return {
      groupJid,
      groupName,
      participants
    };
  }
  updateStatus(status, extra = {}) {
    this.statusChangedAt = Date.now();
    this.currentStatus = status;
    if (extra.error !== void 0) this.lastError = extra.error;
    if (extra.qrCode !== void 0) {
      this.currentQR = extra.qrCode;
      this.currentQRDataUrl = extra.qrCode;
    }
    const payload = this.getState();
    if (this.io) {
      this.io.to(`instance:${this.instanceId}`).emit("whatsapp:state", payload);
    }
  }
  async connect() {
    if (this.isStarting || this.restartInProgress) {
      console.log(`[WhatsApp] start requested - already in progress generation=${this.socketGeneration}`);
      return;
    }
    if (this.currentStatus === "connected" && this.sock) {
      console.log(`[WhatsApp] start requested - already connected generation=${this.socketGeneration}`);
      return;
    }
    console.log("[WhatsApp] start requested");
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
    } catch (err) {
      this.isStarting = false;
      console.log("[WhatsApp] start error:", err?.message || err);
      this.updateStatus("error", { error: err?.message || "Erro ao inicializar conex\xE3o WhatsApp" });
    }
  }
  async createSocket() {
    this.socketGeneration++;
    const currentGen = this.socketGeneration;
    console.log(`[WhatsApp] socket created generation=${currentGen}`);
    if (this.currentStatus !== "authenticated") {
      this.updateStatus("connecting", { error: null });
    }
    this.ensureAuthDir();
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const logger = pino({ level: "silent" });
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners("creds.update");
        this.sock.ev.removeAllListeners("connection.update");
        this.sock.ev.removeAllListeners("messages.upsert");
      } catch {
      }
      this.sock = null;
    }
    this.sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ["North Code Zap", "Chrome", "1.0.0"],
      connectTimeoutMs: 6e4,
      defaultQueryTimeoutMs: 6e4,
      keepAliveIntervalMs: 25e3,
      cachedGroupMetadata: async (jid) => {
        const cached = this.groupCache.get(jid);
        if (cached && cached.expiresAt > Date.now()) {
          return cached.data;
        }
        try {
          const meta = await this.sock?.groupMetadata(jid);
          if (meta) {
            this.groupCache.set(jid, { data: meta, expiresAt: Date.now() + 3e5 });
          }
          return meta;
        } catch {
          return void 0;
        }
      }
    });
    this.sock.ev.on("creds.update", async () => {
      console.log(`[WhatsApp] credentials updated generation=${currentGen}`);
      await saveCreds();
    });
    this.sock.ev.on("messages.upsert", async ({ messages: newMessages, type }) => {
      if (currentGen !== this.socketGeneration) {
        console.log(`[WhatsApp] ignoring messages.upsert from stale socket generation ${currentGen}`);
        return;
      }
      if (!newMessages || newMessages.length === 0) return;
      for (const msg of newMessages) {
        if (msg.key?.fromMe) {
          continue;
        }
        const remoteJid = msg.key?.remoteJid || "";
        if (!remoteJid || remoteJid === "status@broadcast" || remoteJid.includes("@broadcast")) {
          continue;
        }
        const messageId = msg.key?.id || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        if (this.messages.some((m) => m.id === messageId)) {
          continue;
        }
        const rawNumber = remoteJid.split("@")[0].split(":")[0];
        const pushName = msg.pushName || null;
        let text = "";
        let messageType = "text";
        if (msg.message?.conversation) {
          text = msg.message.conversation;
          messageType = "text";
        } else if (msg.message?.extendedTextMessage?.text) {
          text = msg.message.extendedTextMessage.text;
          messageType = "text";
        } else if (msg.message?.imageMessage) {
          text = msg.message.imageMessage.caption || "[Imagem]";
          messageType = "image";
        } else if (msg.message?.videoMessage) {
          text = msg.message.videoMessage.caption || "[V\xEDdeo]";
          messageType = "video";
        } else if (msg.message?.audioMessage) {
          text = "[\xC1udio]";
          messageType = "audio";
        } else if (msg.message?.documentMessage) {
          text = msg.message.documentMessage.fileName ? `[Documento: ${msg.message.documentMessage.fileName}]` : "[Documento]";
          messageType = "document";
        } else if (msg.message?.stickerMessage) {
          text = "[Sticker]";
          messageType = "sticker";
        } else if (msg.message?.contactMessage) {
          text = "[Contato]";
          messageType = "contact";
        } else if (msg.message?.locationMessage) {
          text = "[Localiza\xE7\xE3o]";
          messageType = "location";
        } else {
          text = "[Mensagem]";
          messageType = "other";
        }
        let timestamp = Date.now();
        if (typeof msg.messageTimestamp === "number") {
          timestamp = msg.messageTimestamp * 1e3;
        } else if (typeof msg.messageTimestamp === "object" && msg.messageTimestamp !== null) {
          timestamp = Number(msg.messageTimestamp) * 1e3;
        }
        const receivedMessage = {
          id: messageId,
          remoteJid,
          number: rawNumber || null,
          pushName,
          text,
          type: messageType,
          timestamp,
          direction: "incoming"
        };
        const isGroupMessage = remoteJid.endsWith("@g.us");
        if (!isGroupMessage && !remoteJid.includes("@broadcast")) {
          this.messages = [receivedMessage, ...this.messages].slice(0, MAX_MESSAGES_IN_MEMORY);
        }
        if (!isGroupMessage && !remoteJid.includes("@broadcast")) {
          this.contactsService.upsertContact({
            jid: remoteJid,
            number: rawNumber || null,
            name: pushName,
            source: "message",
            lastSeenAt: new Date(timestamp).toISOString()
          });
        }
        console.log(`[WhatsApp] message received from=${rawNumber || remoteJid} type=${messageType}${isGroupMessage ? " (group)" : ""}`);
        if (this.io && !isGroupMessage && !remoteJid.includes("@broadcast")) {
          this.io.to(`instance:${this.instanceId}`).emit("whatsapp:message", receivedMessage);
        }
      }
    });
    this.sock.ev.on("contacts.upsert", (newContacts) => {
      if (Array.isArray(newContacts)) {
        for (const c of newContacts) {
          if (c?.id && typeof c.name === "string" && c.name.trim().length > 0) {
            this.contactsService.upsertContact({
              jid: c.id,
              name: c.name,
              source: "contact"
            });
          }
        }
      }
    });
    this.sock.ev.on("contacts.update", (updates) => {
      if (Array.isArray(updates)) {
        for (const c of updates) {
          if (c?.id && typeof c.name === "string" && c.name.trim().length > 0) {
            this.contactsService.upsertContact({
              jid: c.id,
              name: c.name,
              source: "contact"
            });
          }
        }
      }
    });
    this.sock.ev.on("messaging-history.set", ({ contacts: histContacts, chats: histChats }) => {
      if (Array.isArray(histContacts)) {
        for (const c of histContacts) {
          if (c?.id && typeof c.name === "string" && c.name.trim().length > 0) {
            this.contactsService.upsertContact({
              jid: c.id,
              name: c.name,
              source: "contact"
            });
          }
        }
      }
      if (Array.isArray(histChats)) {
        for (const ch of histChats) {
          if (ch?.id && !ch.id.endsWith("@g.us") && !ch.id.includes("@broadcast")) {
            this.contactsService.upsertContact({
              jid: ch.id,
              name: ch.name || null,
              source: "chat"
            });
          }
        }
      }
    });
    this.sock.ev.on("connection.update", async (update) => {
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
              dark: "#000000",
              light: "#FFFFFF"
            }
          });
        } catch (err) {
          console.error("[WhatsApp] error generating qr data url:", err);
          this.currentQRDataUrl = null;
        }
        this.updateStatus("qr", { qrCode: this.currentQRDataUrl, error: null });
      }
      if (connection === "connecting") {
        console.log(`[WhatsApp] connecting generation=${currentGen}`);
        if (this.currentStatus !== "qr" && this.currentStatus !== "authenticated") {
          this.updateStatus("connecting");
        }
      }
      if (connection === "open") {
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
        const userJid = this.sock?.user?.id || "";
        const rawNumber = userJid.split(":")[0].split("@")[0];
        const userName = this.sock?.user?.name || this.sock?.user?.notify || "WhatsApp User";
        this.accountInfo = {
          name: userName,
          number: rawNumber || null,
          jid: userJid || null
        };
        this.connectedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.updateStatus("connected", { qrCode: null, error: null });
        this.startConnectionSupervisor();
      }
      if (connection === "close") {
        this.isStarting = false;
        const boomError = lastDisconnect?.error;
        const statusCode = boomError?.output?.statusCode ?? boomError?.statusCode ?? lastDisconnect?.error?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || "Connection closed";
        this.lastDisconnectCode = statusCode ?? null;
        console.log(`[WhatsApp] disconnected code=${statusCode} reason=${errorMessage} generation=${currentGen}`);
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log(`[WhatsApp] restart required after pairing generation=${currentGen}`);
          this.currentQR = null;
          this.currentQRDataUrl = null;
          this.updateStatus("connecting", { qrCode: null, error: null });
          this.restartWhatsAppConnection();
          return;
        }
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
          this.updateStatus("disconnected", { error: "Desconectado do WhatsApp." });
          return;
        }
        if (this.isTransientDisconnectCode(statusCode)) {
          const delay = this.getReconnectDelay();
          this.reconnectAttempt++;
          console.log(`[WhatsApp] transient disconnect code=${statusCode} attempt=${this.reconnectAttempt} reconnectIn=${delay}ms generation=${currentGen}`);
          this.updateStatus("connecting", { error: null });
          this.restartWhatsAppConnection(delay);
          return;
        }
        this.autoReconnectBlocked = true;
        this.reconnectAttempt = 0;
        this.clearReconnectTimer();
        this.stopConnectionSupervisor();
        this.restartInProgress = false;
        this.updateStatus("error", {
          error: statusCode ? `Conex\xE3o encerrada (c\xF3digo ${statusCode})` : errorMessage
        });
      }
    });
  }
  async restartWhatsAppConnection(delayMs = 0) {
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
        console.log("[WhatsApp] reconnect cancelled because auto reconnect is blocked");
        this.restartInProgress = false;
        return;
      }
      try {
        console.log(`[WhatsApp] recreating socket generation=${this.socketGeneration + 1}`);
        await this.createSocket();
      } catch (err) {
        console.log(`[WhatsApp] error recreating socket: ${err?.message || err}`);
        this.restartInProgress = false;
        if (!this.autoReconnectBlocked && this.hasSavedSession()) {
          const nextDelay = this.getReconnectDelay();
          this.reconnectAttempt++;
          console.log(`[WhatsApp] reconnect attempt failed scheduling next in ${nextDelay}ms`);
          this.reconnectTimer = null;
          this.restartWhatsAppConnection(nextDelay);
        } else {
          this.updateStatus("error", { error: err?.message || "Erro ao recriar conex\xE3o WhatsApp" });
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
  async disconnect(clearSession = true) {
    console.log("[WhatsApp] disconnecting requested by user");
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
          this.sock.end(void 0);
        }
        this.sock = null;
      }
    } catch (err) {
      console.error("[WhatsApp] error during disconnect:", err?.message);
    } finally {
      this.currentQR = null;
      this.currentQRDataUrl = null;
      this.accountInfo = { name: null, number: null, jid: null };
      this.connectedAt = null;
      if (clearSession) {
        this.clearSessionFiles();
      }
      this.updateStatus("disconnected", { error: null, qrCode: null });
    }
  }
  clearSessionFiles() {
    try {
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        fs.mkdirSync(this.authDir, { recursive: true });
        console.log("[WhatsApp] auth directory cleared");
      }
    } catch (err) {
      console.error("[WhatsApp] error clearing auth dir:", err?.message);
    }
  }
  hasSavedSession() {
    return fs.existsSync(path.join(this.authDir, "creds.json"));
  }
  isTransientDisconnectCode(statusCode) {
    return statusCode === DisconnectReason.connectionClosed || statusCode === DisconnectReason.connectionLost || statusCode === DisconnectReason.timedOut || statusCode === 503;
  }
  getReconnectDelay() {
    const index = Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1);
    return RECONNECT_BACKOFF_MS[index];
  }
  startConnectionSupervisor() {
    if (this.connectionSupervisorTimer) return;
    this.connectionSupervisorTimer = setInterval(() => {
      if (this.autoReconnectBlocked) return;
      if (!this.hasSavedSession()) return;
      const currentStatus = this.currentStatus;
      if (currentStatus === "connected") return;
      if (this.isStarting || this.restartInProgress || this.reconnectTimer) return;
      let shouldRecover = false;
      if (currentStatus === "error" && this.isTransientDisconnectCode(this.lastDisconnectCode)) {
        shouldRecover = true;
      } else if (currentStatus === "disconnected" && !this.autoReconnectBlocked && this.hasSavedSession()) {
        shouldRecover = true;
      } else if (currentStatus === "connecting" && Date.now() - this.statusChangedAt > CONNECTING_STALL_MS) {
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
  stopConnectionSupervisor() {
    if (this.connectionSupervisorTimer) {
      clearInterval(this.connectionSupervisorTimer);
      this.connectionSupervisorTimer = null;
    }
  }
  ensureConnected(reason = "external") {
    if (this.currentStatus === "connected") return true;
    if (this.autoReconnectBlocked) return false;
    if (!this.hasSavedSession()) return false;
    if (this.isStarting || this.restartInProgress || this.reconnectTimer) return false;
    let recoverable = false;
    if (this.currentStatus === "disconnected") {
      recoverable = true;
    } else if (this.currentStatus === "error" && this.isTransientDisconnectCode(this.lastDisconnectCode)) {
      recoverable = true;
    } else if (this.currentStatus === "connecting" && Date.now() - this.statusChangedAt > CONNECTING_STALL_MS) {
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
  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
};

// server/contacts.ts
import fs2 from "fs";
import path2 from "path";
var ContactsService = class {
  constructor(contactsFile) {
    this.contactsMap = /* @__PURE__ */ new Map();
    this.saveDebounceTimer = null;
    this.contactsFile = contactsFile;
    this.contactsTmpFile = contactsFile + ".tmp";
    this.recipientsDir = path2.dirname(contactsFile);
    this.ensureDirectory();
    this.loadContacts();
  }
  flushPendingSave() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
      this.saveContacts();
    }
  }
  ensureDirectory() {
    try {
      if (!fs2.existsSync(this.recipientsDir)) {
        fs2.mkdirSync(this.recipientsDir, { recursive: true });
      }
    } catch (err) {
      console.error("[Contacts] error creating recipients directory:", err?.message || err);
    }
  }
  loadContacts() {
    try {
      if (fs2.existsSync(this.contactsFile)) {
        const raw = fs2.readFileSync(this.contactsFile, "utf-8");
        const parsed = JSON.parse(raw);
        const validSources = ["message", "contact", "chat"];
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.jid === "string") {
              if (!validSources.includes(item.source)) {
                continue;
              }
              const normalizedJid = this.normalizeJid(item.jid);
              if (normalizedJid) {
                this.contactsMap.set(normalizedJid, {
                  jid: normalizedJid,
                  number: item.number || normalizedJid.split("@")[0].split(":")[0],
                  name: item.name || null,
                  source: item.source,
                  lastSeenAt: item.lastSeenAt || null
                });
              }
            }
          }
          console.log(`[Contacts] loaded known contacts=${this.contactsMap.size}`);
        }
      }
    } catch (err) {
      console.error("[Contacts] error loading contacts file:", err?.message || err);
    }
  }
  scheduleSave() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveContacts();
    }, 1500);
  }
  saveContacts() {
    this.ensureDirectory();
    try {
      const list = Array.from(this.contactsMap.values());
      const data = JSON.stringify(list, null, 2);
      fs2.writeFileSync(this.contactsTmpFile, data, "utf-8");
      fs2.renameSync(this.contactsTmpFile, this.contactsFile);
    } catch (err) {
      console.error("[Contacts] error saving contacts file:", err?.message || err);
    }
  }
  normalizeJid(rawJid) {
    if (!rawJid || typeof rawJid !== "string") return null;
    const clean = rawJid.trim().toLowerCase();
    if (clean.endsWith("@g.us") || clean.includes("@broadcast") || clean.startsWith("status@") || clean.includes("newsletter")) {
      return null;
    }
    if (clean.includes("@s.whatsapp.net")) {
      const num = clean.split("@")[0].split(":")[0];
      return `${num}@s.whatsapp.net`;
    }
    const digitsOnly = clean.replace(/\D/g, "");
    if (digitsOnly.length >= 10) {
      return `${digitsOnly}@s.whatsapp.net`;
    }
    return null;
  }
  upsertContact(contact) {
    const normalizedJid = this.normalizeJid(contact.jid);
    if (!normalizedJid) return null;
    const rawNumber = contact.number || normalizedJid.split("@")[0].split(":")[0];
    const existing = this.contactsMap.get(normalizedJid);
    let chosenName = contact.name || null;
    if (!chosenName && existing?.name) {
      chosenName = existing.name;
    }
    if (chosenName && (chosenName.startsWith("+") || /^\d+$/.test(chosenName))) {
      if (existing?.name && !/^\+?\d+$/.test(existing.name)) {
        chosenName = existing.name;
      }
    }
    let resolvedSource = contact.source;
    if (existing) {
      if (existing.source === "contact") {
        resolvedSource = "contact";
      } else if (existing.source === "chat" && contact.source === "message") {
        resolvedSource = "chat";
      }
    }
    const updated = {
      jid: normalizedJid,
      number: rawNumber,
      name: chosenName,
      source: resolvedSource,
      lastSeenAt: contact.lastSeenAt ?? existing?.lastSeenAt ?? null
    };
    this.contactsMap.set(normalizedJid, updated);
    this.scheduleSave();
    return updated;
  }
  upsertBatch(contacts) {
    let count = 0;
    for (const c of contacts) {
      if (this.upsertContact(c)) {
        count++;
      }
    }
    return count;
  }
  getContact(jid) {
    const normalized = this.normalizeJid(jid);
    if (!normalized) return void 0;
    return this.contactsMap.get(normalized);
  }
  getAll() {
    const list = Array.from(this.contactsMap.values());
    return list.sort((a, b) => {
      const nameA = (a.name || "").trim();
      const nameB = (b.name || "").trim();
      if (nameA && !nameB) return -1;
      if (!nameA && nameB) return 1;
      if (nameA && nameB) return nameA.localeCompare(nameB);
      return (b.lastSeenAt || "").localeCompare(a.lastSeenAt || "");
    });
  }
};

// server/audiences.ts
import fs3 from "fs";
import path3 from "path";
import crypto from "crypto";
function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
function isValidDate(dateStr) {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}
function isValidIndividualJid(jid) {
  return typeof jid === "string" && jid.trim().length > 0 && jid.endsWith("@s.whatsapp.net");
}
var AudienceService = class {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = {
      tags: [],
      lists: [],
      contactTags: {}
    };
    this.ensureDirectory();
    this.load();
  }
  ensureDirectory() {
    const dir = path3.dirname(this.filePath);
    if (!fs3.existsSync(dir)) {
      fs3.mkdirSync(dir, { recursive: true });
    }
  }
  load() {
    if (!fs3.existsSync(this.filePath)) {
      return;
    }
    const content = fs3.readFileSync(this.filePath, "utf-8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid audiences file format");
    const tags = [];
    const tagIds = /* @__PURE__ */ new Set();
    const tagNames = /* @__PURE__ */ new Set();
    if (!Array.isArray(parsed.tags)) throw new Error("tags must be an array");
    for (const t of parsed.tags) {
      if (!t || typeof t !== "object") throw new Error("Invalid tag object");
      if (!t.id || typeof t.id !== "string" || !isValidUuid(t.id)) throw new Error("Invalid tag id");
      if (tagIds.has(t.id)) throw new Error("Duplicate tag id");
      if (!t.name || typeof t.name !== "string" || !t.name.trim()) throw new Error("Invalid tag name");
      const nameTrimmed = t.name.trim();
      if (nameTrimmed.length > 60) throw new Error("Tag name too long");
      const nameLower = nameTrimmed.toLowerCase();
      if (tagNames.has(nameLower)) throw new Error("Duplicate tag name");
      if (!t.createdAt || typeof t.createdAt !== "string" || !isValidDate(t.createdAt)) throw new Error("Invalid tag createdAt");
      if (!t.updatedAt || typeof t.updatedAt !== "string" || !isValidDate(t.updatedAt)) throw new Error("Invalid tag updatedAt");
      tagIds.add(t.id);
      tagNames.add(nameLower);
      tags.push({ ...t, name: nameTrimmed });
    }
    const lists = [];
    const listIds = /* @__PURE__ */ new Set();
    const listNames = /* @__PURE__ */ new Set();
    if (!Array.isArray(parsed.lists)) throw new Error("lists must be an array");
    for (const l of parsed.lists) {
      if (!l || typeof l !== "object") throw new Error("Invalid list object");
      if (!l.id || typeof l.id !== "string" || !isValidUuid(l.id)) throw new Error("Invalid list id");
      if (listIds.has(l.id)) throw new Error("Duplicate list id");
      if (!l.name || typeof l.name !== "string" || !l.name.trim()) throw new Error("Invalid list name");
      const nameTrimmed = l.name.trim();
      if (nameTrimmed.length > 100) throw new Error("List name too long");
      const nameLower = nameTrimmed.toLowerCase();
      if (listNames.has(nameLower)) throw new Error("Duplicate list name");
      if (!Array.isArray(l.contactJids)) throw new Error("list contactJids must be an array");
      const jids = /* @__PURE__ */ new Set();
      for (const jid of l.contactJids) {
        if (!isValidIndividualJid(jid)) throw new Error(`Invalid jid in list ${l.name}: ${jid}`);
        if (jids.has(jid)) throw new Error("Duplicate jid in list");
        jids.add(jid);
      }
      if (!l.createdAt || typeof l.createdAt !== "string" || !isValidDate(l.createdAt)) throw new Error("Invalid list createdAt");
      if (!l.updatedAt || typeof l.updatedAt !== "string" || !isValidDate(l.updatedAt)) throw new Error("Invalid list updatedAt");
      listIds.add(l.id);
      listNames.add(nameLower);
      lists.push({ ...l, name: nameTrimmed, contactJids: Array.from(jids) });
    }
    if (!parsed.contactTags || typeof parsed.contactTags !== "object" || Array.isArray(parsed.contactTags)) {
      throw new Error("contactTags must be an object");
    }
    const contactTags = {};
    for (const jid of Object.keys(parsed.contactTags)) {
      if (!isValidIndividualJid(jid)) throw new Error(`Invalid jid in contactTags: ${jid}`);
      const tIds = parsed.contactTags[jid];
      if (!Array.isArray(tIds)) throw new Error(`tag array for ${jid} must be an array`);
      const uniqueTags = /* @__PURE__ */ new Set();
      for (const tId of tIds) {
        if (typeof tId !== "string") throw new Error("tag id must be string");
        if (!tagIds.has(tId)) throw new Error(`tag id ${tId} does not exist`);
        if (uniqueTags.has(tId)) throw new Error(`duplicate tag id ${tId} for jid ${jid}`);
        uniqueTags.add(tId);
      }
      if (uniqueTags.size > 0) {
        contactTags[jid] = Array.from(uniqueTags);
      }
    }
    this.state = {
      tags,
      lists,
      contactTags
    };
  }
  persist(nextState) {
    this.ensureDirectory();
    const tmp = this.filePath + ".tmp";
    fs3.writeFileSync(tmp, JSON.stringify(nextState, null, 2), { encoding: "utf-8", mode: 384 });
    fs3.renameSync(tmp, this.filePath);
    this.state = nextState;
  }
  getState() {
    return this.state;
  }
  // Tags
  createTag(name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 60) throw new Error("Invalid tag name");
    const lower = trimmed.toLowerCase();
    if (this.state.tags.some((t) => t.name.toLowerCase() === lower)) {
      throw new Error("Duplicate tag name");
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const tag = {
      id: crypto.randomUUID(),
      name: trimmed,
      createdAt: now,
      updatedAt: now
    };
    const nextState = structuredClone(this.state);
    nextState.tags.push(tag);
    this.persist(nextState);
    return tag;
  }
  renameTag(id, name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 60) throw new Error("Invalid tag name");
    const lower = trimmed.toLowerCase();
    const tagIdx = this.state.tags.findIndex((t) => t.id === id);
    if (tagIdx === -1) throw new Error("Tag not found");
    if (this.state.tags.some((t) => t.id !== id && t.name.toLowerCase() === lower)) {
      throw new Error("Duplicate tag name");
    }
    const nextState = structuredClone(this.state);
    nextState.tags[tagIdx].name = trimmed;
    nextState.tags[tagIdx].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist(nextState);
    return nextState.tags[tagIdx];
  }
  deleteTag(id) {
    const idx = this.state.tags.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Tag not found");
    const nextState = structuredClone(this.state);
    nextState.tags.splice(idx, 1);
    for (const jid of Object.keys(nextState.contactTags)) {
      nextState.contactTags[jid] = nextState.contactTags[jid].filter((tId) => tId !== id);
      if (nextState.contactTags[jid].length === 0) {
        delete nextState.contactTags[jid];
      }
    }
    this.persist(nextState);
  }
  // Tags <-> Contacts
  addTagToContacts(tagId, jids) {
    if (!this.state.tags.some((t) => t.id === tagId)) throw new Error("Tag not found");
    for (const jid of jids) {
      if (!isValidIndividualJid(jid)) throw new Error(`Invalid JID: ${jid}`);
    }
    const nextState = structuredClone(this.state);
    let changed = false;
    for (const jid of jids) {
      if (!nextState.contactTags[jid]) {
        nextState.contactTags[jid] = [];
      }
      if (!nextState.contactTags[jid].includes(tagId)) {
        nextState.contactTags[jid].push(tagId);
        changed = true;
      }
    }
    if (changed) this.persist(nextState);
  }
  removeTagFromContacts(tagId, jids) {
    if (!this.state.tags.some((t) => t.id === tagId)) throw new Error("Tag not found");
    for (const jid of jids) {
      if (!isValidIndividualJid(jid)) throw new Error(`Invalid JID: ${jid}`);
    }
    const nextState = structuredClone(this.state);
    let changed = false;
    for (const jid of jids) {
      if (nextState.contactTags[jid]) {
        const initialLen = nextState.contactTags[jid].length;
        nextState.contactTags[jid] = nextState.contactTags[jid].filter((tId) => tId !== tagId);
        if (nextState.contactTags[jid].length < initialLen) changed = true;
        if (nextState.contactTags[jid].length === 0) {
          delete nextState.contactTags[jid];
        }
      }
    }
    if (changed) this.persist(nextState);
  }
  // Lists
  createList(name, contactJids) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new Error("Invalid list name");
    const lower = trimmed.toLowerCase();
    if (this.state.lists.some((l) => l.name.toLowerCase() === lower)) {
      throw new Error("Duplicate list name");
    }
    for (const jid of contactJids) {
      if (!isValidIndividualJid(jid)) throw new Error(`Invalid JID: ${jid}`);
    }
    const uniqueJids = Array.from(new Set(contactJids));
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const list = {
      id: crypto.randomUUID(),
      name: trimmed,
      contactJids: uniqueJids,
      createdAt: now,
      updatedAt: now
    };
    const nextState = structuredClone(this.state);
    nextState.lists.push(list);
    this.persist(nextState);
    return list;
  }
  renameList(id, name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new Error("Invalid list name");
    const lower = trimmed.toLowerCase();
    const listIdx = this.state.lists.findIndex((l) => l.id === id);
    if (listIdx === -1) throw new Error("List not found");
    if (this.state.lists.some((l) => l.id !== id && l.name.toLowerCase() === lower)) {
      throw new Error("Duplicate list name");
    }
    const nextState = structuredClone(this.state);
    nextState.lists[listIdx].name = trimmed;
    nextState.lists[listIdx].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist(nextState);
    return nextState.lists[listIdx];
  }
  updateListContacts(id, contactJids) {
    const listIdx = this.state.lists.findIndex((l) => l.id === id);
    if (listIdx === -1) throw new Error("List not found");
    for (const jid of contactJids) {
      if (!isValidIndividualJid(jid)) throw new Error(`Invalid JID: ${jid}`);
    }
    const uniqueJids = Array.from(new Set(contactJids));
    const nextState = structuredClone(this.state);
    nextState.lists[listIdx].contactJids = uniqueJids;
    nextState.lists[listIdx].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist(nextState);
    return nextState.lists[listIdx];
  }
  deleteList(id) {
    const idx = this.state.lists.findIndex((l) => l.id === id);
    if (idx === -1) throw new Error("List not found");
    const nextState = structuredClone(this.state);
    nextState.lists.splice(idx, 1);
    this.persist(nextState);
  }
};

// server/media.ts
import fs4 from "fs";
import path4 from "path";
var MediaService = class {
  constructor(mediaDir) {
    this.mediaDir = path4.resolve(mediaDir);
    try {
      if (!fs4.existsSync(this.mediaDir)) {
        fs4.mkdirSync(this.mediaDir, { recursive: true });
      }
    } catch (err) {
      console.error("[Media] Failed to create media directory:", err);
    }
  }
  getMediaDir() {
    return this.mediaDir;
  }
  getFilePath(fileName) {
    const safeName = path4.basename(fileName);
    return path4.join(this.mediaDir, safeName);
  }
  fileExists(localPath) {
    const candidate = path4.resolve(localPath);
    const root = this.mediaDir + path4.sep;
    if (!candidate.startsWith(root)) {
      return false;
    }
    try {
      return fs4.existsSync(candidate);
    } catch {
      return false;
    }
  }
  deleteMediaIfUnreferenced(localPath, allSchedules) {
    if (!localPath) return false;
    const candidate = path4.resolve(localPath);
    const root = this.mediaDir + path4.sep;
    if (!candidate.startsWith(root)) {
      console.warn(`[Media] Attempted to delete external file: ${localPath}`);
      return false;
    }
    try {
      const isReferenced = allSchedules.some((s) => s.media?.localPath === localPath);
      if (!isReferenced && fs4.existsSync(candidate)) {
        fs4.unlinkSync(candidate);
        console.log(`[Media] Cleaned up unreferenced file: ${localPath}`);
        return true;
      }
    } catch (err) {
      console.warn(`[Media] Failed to delete media file ${localPath}:`, err);
    }
    return false;
  }
};

// server/instances.ts
function isValidUuid2(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
function isValidDate2(dateStr) {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}
var DATA_DIR = process.env.DATA_DIR || path5.join(process.cwd(), "data");
var INSTANCES_FILE = path5.join(DATA_DIR, "instances.json");
var InstanceManager = class {
  constructor() {
    this.runtimes = /* @__PURE__ */ new Map();
    this.io = null;
    this.deletingInstances = /* @__PURE__ */ new Set();
    this.ensureDirectory();
  }
  flushWorkspaceForRestore(workspaceId) {
    for (const runtime of this.runtimes.values()) {
      if (runtime.metadata.workspaceId === workspaceId) {
        runtime.contacts.flushPendingSave();
      }
    }
  }
  suspendWorkspaceForRestore(workspaceId) {
    const idsToRemove = [];
    for (const [id, runtime] of this.runtimes.entries()) {
      if (runtime.metadata.workspaceId === workspaceId) {
        if (runtime.whatsapp && typeof runtime.whatsapp.suspendForRestore === "function") {
          runtime.whatsapp.suspendForRestore();
        }
        idsToRemove.push(id);
      }
    }
    for (const id of idsToRemove) {
      this.runtimes.delete(id);
    }
  }
  validateInstanceMetadata(meta, seenIds) {
    const isValidUuid3 = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
    const isValidDateString = (d) => typeof d === "string" && !isNaN(new Date(d).getTime());
    if (!meta || typeof meta.id !== "string" || !isValidUuid3(meta.id)) {
      console.warn("[InstanceManager] Invalid or missing id in instances.json");
      return false;
    }
    if (typeof meta.workspaceId !== "string" || !isValidUuid3(meta.workspaceId)) {
      console.warn(`[InstanceManager] Missing or invalid workspaceId for instance: ${meta.id}`);
      return false;
    }
    if (seenIds.has(meta.id)) {
      console.warn(`[InstanceManager] Duplicate instance ID found: ${meta.id}. Ignoring duplicate.`);
      return false;
    }
    if (typeof meta.name !== "string" || meta.name.trim() === "") {
      console.warn(`[InstanceManager] Missing or invalid name for instance: ${meta.id}`);
      return false;
    }
    if (!isValidDateString(meta.createdAt)) {
      console.warn(`[InstanceManager] Missing or invalid createdAt for instance: ${meta.id}`);
      return false;
    }
    if (!isValidDateString(meta.updatedAt)) {
      console.warn(`[InstanceManager] Missing or invalid updatedAt for instance: ${meta.id}`);
      return false;
    }
    seenIds.add(meta.id);
    return true;
  }
  async reloadWorkspaceFromDisk(workspaceId) {
    const INSTANCES_FILE2 = path5.join(DATA_DIR, "instances.json");
    let metadatas = [];
    try {
      if (fs5.existsSync(INSTANCES_FILE2)) {
        const raw = fs5.readFileSync(INSTANCES_FILE2, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          metadatas = parsed;
        } else {
          throw new Error("instances.json is not an array.");
        }
      }
    } catch (err) {
      throw new Error("Falha ao carregar instances.json no restore. Corrompido.");
    }
    const validMetas = [];
    const seenIds = /* @__PURE__ */ new Set();
    const allValidMetas = [];
    for (const meta of metadatas) {
      if (!this.validateInstanceMetadata(meta, seenIds)) {
        throw new Error(`Metadata inv\xE1lida para inst\xE2ncia ${meta.id || "unknown"}`);
      }
      allValidMetas.push(meta);
    }
    for (const meta of allValidMetas) {
      if (meta.workspaceId === workspaceId) {
        validMetas.push(meta);
      }
    }
    for (const meta of validMetas) {
      this.createRuntime(meta);
    }
    for (const meta of validMetas) {
      const runtime = this.runtimes.get(meta.id);
      if (runtime) {
        const authDir = path5.join(DATA_DIR, "instances", runtime.metadata.id, "auth");
        const credsFile = path5.join(authDir, "creds.json");
        if (fs5.existsSync(credsFile)) {
          runtime.whatsapp.connect().catch((err) => {
            console.error(`[InstanceManager] Failed to auto-connect ${runtime.metadata.id} after restore:`, err);
          });
        }
      }
    }
  }
  setSocketIO(io) {
    this.io = io;
    for (const runtime of this.runtimes.values()) {
      runtime.whatsapp.setSocketIO(io);
    }
  }
  ensureDirectory() {
    try {
      if (!fs5.existsSync(DATA_DIR)) {
        fs5.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err) {
      console.error("[InstanceManager] error creating DATA_DIR:", err);
    }
  }
  async init() {
    let metadatas = [];
    try {
      if (fs5.existsSync(INSTANCES_FILE)) {
        const raw = fs5.readFileSync(INSTANCES_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          metadatas = parsed;
        } else {
          console.warn("[InstanceManager] instances.json is not an array. Initializing empty.");
        }
      }
    } catch (err) {
      console.error("[InstanceManager] error loading instances.json:", err);
    }
    const validMetas = [];
    const seenIds = /* @__PURE__ */ new Set();
    for (const meta of metadatas) {
      if (!meta || typeof meta.id !== "string" || !isValidUuid2(meta.id)) {
        console.warn("[InstanceManager] Invalid or missing id in instances.json");
        continue;
      }
      if (typeof meta.workspaceId !== "string" || !isValidUuid2(meta.workspaceId)) {
        console.warn(`[InstanceManager] Missing or invalid workspaceId for instance: ${meta.id}`);
        continue;
      }
      if (seenIds.has(meta.id)) {
        console.warn(`[InstanceManager] Duplicate instance ID found: ${meta.id}. Ignoring duplicate.`);
        continue;
      }
      if (typeof meta.name !== "string" || !meta.name.trim()) {
        console.warn(`[InstanceManager] Invalid name for instance: ${meta.id}`);
        continue;
      }
      if (typeof meta.createdAt !== "string" || !isValidDate2(meta.createdAt)) {
        console.warn(`[InstanceManager] Invalid createdAt for instance: ${meta.id}`);
        continue;
      }
      if (typeof meta.updatedAt !== "string" || !isValidDate2(meta.updatedAt)) {
        console.warn(`[InstanceManager] Invalid updatedAt for instance: ${meta.id}`);
        continue;
      }
      seenIds.add(meta.id);
      validMetas.push({
        id: meta.id,
        workspaceId: meta.workspaceId,
        name: meta.name.trim(),
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt
      });
    }
    for (const meta of validMetas) {
      this.createRuntime(meta);
    }
    for (const runtime of this.runtimes.values()) {
      const authDir = path5.join(DATA_DIR, "instances", runtime.metadata.id, "auth");
      const credsFile = path5.join(authDir, "creds.json");
      if (fs5.existsSync(credsFile)) {
        runtime.whatsapp.connect().catch((err) => {
          console.error(`[InstanceManager] Failed to auto-connect \${runtime.metadata.id}:`, err);
        });
      }
    }
  }
  saveMetadatas() {
    try {
      const metadatas = Array.from(this.runtimes.values()).map((r) => r.metadata);
      const tmp = INSTANCES_FILE + ".tmp";
      fs5.writeFileSync(tmp, JSON.stringify(metadatas, null, 2), "utf-8");
      fs5.renameSync(tmp, INSTANCES_FILE);
    } catch (err) {
      console.error("[InstanceManager] error saving instances.json:", err);
    }
  }
  createRuntime(meta) {
    const instanceDir = path5.join(DATA_DIR, "instances", meta.id);
    const authDir = path5.join(instanceDir, "auth");
    const recipientsDir = path5.join(instanceDir, "recipients");
    const mediaDir = path5.join(instanceDir, "media");
    [authDir, recipientsDir, mediaDir].forEach((d) => {
      if (!fs5.existsSync(d)) {
        fs5.mkdirSync(d, { recursive: true });
      }
    });
    const contactsFile = path5.join(recipientsDir, "contacts.json");
    const contacts = new ContactsService(contactsFile);
    const audiencesFile = path5.join(recipientsDir, "audiences.json");
    const audiences = new AudienceService(audiencesFile);
    const media = new MediaService(mediaDir);
    const whatsapp = new WhatsAppService(meta.id, authDir, contacts);
    if (this.io) {
      whatsapp.setSocketIO(this.io);
    }
    const runtime = {
      metadata: meta,
      whatsapp,
      contacts,
      audiences,
      media
    };
    this.runtimes.set(meta.id, runtime);
    return runtime;
  }
  createInstance(name, workspaceId) {
    if (typeof name !== "string" || !name.trim()) throw new Error("Nome de inst\xE2ncia inv\xE1lido.");
    const id = crypto2.randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const meta = {
      id,
      workspaceId,
      name: name.trim(),
      createdAt: now,
      updatedAt: now
    };
    this.createRuntime(meta);
    this.saveMetadatas();
    return meta;
  }
  renameInstance(id, newName) {
    if (typeof newName !== "string" || !newName.trim()) throw new Error("Nome de inst\xE2ncia inv\xE1lido.");
    const runtime = this.runtimes.get(id);
    if (!runtime) return null;
    runtime.metadata.name = newName.trim();
    runtime.metadata.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.saveMetadatas();
    return runtime.metadata;
  }
  async deleteInstance(id) {
    if (this.deletingInstances.has(id)) return false;
    const runtime = this.runtimes.get(id);
    if (!runtime) return false;
    this.deletingInstances.add(id);
    try {
      runtime.whatsapp.clearReconnectTimer?.();
      await runtime.whatsapp.disconnect();
      this.runtimes.delete(id);
      this.saveMetadatas();
      const instanceDir = path5.join(DATA_DIR, "instances", id);
      if (fs5.existsSync(instanceDir)) {
        fs5.rmSync(instanceDir, { recursive: true, force: true });
      }
      return true;
    } catch (err) {
      console.error(`[InstanceManager] error deleting instance ${id}:`, err);
      return false;
    } finally {
      this.deletingInstances.delete(id);
    }
  }
  getForWorkspace(id, workspaceId) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return void 0;
    if (runtime.metadata.workspaceId !== workspaceId) return void 0;
    return runtime;
  }
  listForWorkspace(workspaceId) {
    return Array.from(this.runtimes.values()).filter((r) => r.metadata.workspaceId === workspaceId).map((r) => r.metadata);
  }
  get(id) {
    return this.runtimes.get(id);
  }
  list() {
    return Array.from(this.runtimes.values()).map((r) => r.metadata);
  }
};

// test-harness.ts
var manager = new InstanceManager();
manager.reloadWorkspaceFromDisk("00000000-0000-0000-0000-000000000000").then(() => console.log("Successfully completed reloadWorkspaceFromDisk in ESM!")).catch((err) => {
  console.error(err);
  process.exit(1);
});
