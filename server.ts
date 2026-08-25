import type { SchedulePayload } from './src/types';
import express from 'express';
import http from 'http';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { InstanceManager, DATA_DIR } from './server/instances.ts';
import { SchedulerService } from './server/scheduler.ts';
import { authService, User, Workspace, Session } from './server/auth.ts';
import { getCookieFromRequest, getCookieFromSocket } from './server/cookie.ts';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        sessionId: string;
        user: User;
        workspace: Workspace;
      }
    }
  }
}

const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || 'America/Belem';
process.env.TZ = APP_TIMEZONE;

const instanceManager = new InstanceManager();
const schedulerService = new SchedulerService(instanceManager);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const instanceId = req.params.instanceId;
    const runtime = instanceManager.getForWorkspace(instanceId, req.auth!.workspace.id);
    if (!runtime) {
      return cb(new Error('Instance not found'), '');
    }
    cb(null, runtime.media.getMediaDir());
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const cleanExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const uniqueName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${cleanExt}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não suportado. Envie imagens JPG, PNG ou WebP.'));
    }
  },
});

function validateSchedulePayload(body: unknown): { valid: true; payload: SchedulePayload } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Payload inválido.' };
  }
  
  const hasOwn = (obj: object, prop: string) => Object.prototype.hasOwnProperty.call(obj, prop);
  const requiredFields = [
    'name', 'message', 'targets', 'scheduleType', 'scheduledAt',
    'dailyTimes', 'weeklyTimeSlots', 'media', 'fallbackName', 'deliveryOptions'
  ];

  for (const field of requiredFields) {
    if (!hasOwn(body, field)) {
      return { valid: false, error: `Campo ${field} é obrigatório no payload.` };
    }
  }

  const payload = body as Record<string, any>;
  if (typeof payload.name !== 'string' || !payload.name.trim()) return { valid: false, error: 'Nome inválido.' };
  if (typeof payload.message !== 'string') return { valid: false, error: 'Message inválido.' };
  if (typeof payload.fallbackName !== 'string' || !payload.fallbackName.trim()) return { valid: false, error: 'FallbackName inválido.' };

  let validMedia = false;
  if (payload.media === null) {
    validMedia = true;
  } else if (typeof payload.media === 'object' && payload.media !== null && payload.media.type === 'image') {
    if (payload.media.source === 'upload' && typeof payload.media.localPath === 'string' && payload.media.localPath.trim().length > 0) validMedia = true;
    else if (payload.media.source === 'url' && typeof payload.media.url === 'string' && /^https?:\/\//i.test(payload.media.url)) validMedia = true;
  }
  if (!validMedia) return { valid: false, error: 'Mídia inválida.' };

  if (!payload.message.trim() && payload.media === null) return { valid: false, error: 'Sem texto e sem mídia.' };
  
  if (!Array.isArray(payload.targets) || payload.targets.length === 0) return { valid: false, error: 'Sem destinatário.' };
  const validSources = ['directory', 'manual', 'import', 'group_member', 'group'];
  for (const t of payload.targets) {
    if (t.type !== 'person' && t.type !== 'group') return { valid: false, error: 'Tipo target inválido.' };
    if (typeof t.jid !== 'string' || !t.jid.trim()) return { valid: false, error: 'JID target inválido.' };
    if (typeof t.label !== 'string' || !t.label.trim()) return { valid: false, error: 'Label target inválido.' };
    if (!validSources.includes(t.source)) return { valid: false, error: 'Source target inválido.' };
    if (t.type === 'group' && t.source !== 'group') return { valid: false, error: 'Group source inválido.' };
    if (t.source === 'group_member' && t.type !== 'person') return { valid: false, error: 'Group_member type inválido.' };
    if (t.source === 'directory' && t.type !== 'person') return { valid: false, error: 'Directory type inválido.' };
    if (t.source === 'manual' && t.type !== 'person') return { valid: false, error: 'Manual type inválido.' };
    if (t.source === 'import' && t.type !== 'person') return { valid: false, error: 'Import type inválido.' };
  }

  const dOpt = payload.deliveryOptions;
  if (!dOpt || typeof dOpt !== 'object') return { valid: false, error: 'Delivery options inválido.' };
  if (typeof dOpt.intervalBetweenMessagesMs !== 'number' || !Number.isFinite(dOpt.intervalBetweenMessagesMs) || dOpt.intervalBetweenMessagesMs < 1000) return { valid: false, error: 'Interval inválido.' };
  if (typeof dOpt.batchPauseEnabled !== 'boolean') return { valid: false, error: 'batchPauseEnabled inválido.' };
  if (typeof dOpt.batchSize !== 'number' || !Number.isInteger(dOpt.batchSize) || dOpt.batchSize < 1) return { valid: false, error: 'batchSize inválido.' };
  if (typeof dOpt.batchPauseMs !== 'number' || !Number.isFinite(dOpt.batchPauseMs) || dOpt.batchPauseMs < 60000) return { valid: false, error: 'batchPauseMs inválido.' };

  if (!['once', 'daily', 'weekly'].includes(payload.scheduleType)) return { valid: false, error: 'ScheduleType inválido.' };
  if (!Array.isArray(payload.dailyTimes)) return { valid: false, error: 'dailyTimes inválido.' };
  if (!Array.isArray(payload.weeklyTimeSlots)) return { valid: false, error: 'weeklyTimeSlots inválido.' };

  const isValidTime = (t: any) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

  let parsedScheduledAt = payload.scheduledAt;
  if (payload.scheduleType === 'once') {
    if (typeof payload.scheduledAt !== 'string') return { valid: false, error: 'scheduledAt once inválido.' };
    const parsedDate = new Date(payload.scheduledAt);
    if (isNaN(parsedDate.getTime())) return { valid: false, error: 'Data inválida.' };
    if (parsedDate.getTime() <= Date.now()) return { valid: false, error: 'Futuro obrigatório once.' };
    if (payload.dailyTimes.length > 0) return { valid: false, error: 'dailyTimes deve ser vazio once.' };
    if (payload.weeklyTimeSlots.length > 0) return { valid: false, error: 'weeklyTimeSlots deve ser vazio once.' };
    parsedScheduledAt = parsedDate.toISOString();
  } else if (payload.scheduleType === 'daily') {
    if (payload.scheduledAt !== null) return { valid: false, error: 'scheduledAt daily inválido.' };
    if (payload.dailyTimes.length === 0 || !payload.dailyTimes.every(isValidTime)) return { valid: false, error: 'dailyTimes inválido.' };
    if (payload.weeklyTimeSlots.length > 0) return { valid: false, error: 'weeklyTimeSlots vazio daily.' };
  } else if (payload.scheduleType === 'weekly') {
    if (payload.scheduledAt !== null) return { valid: false, error: 'scheduledAt weekly inválido.' };
    if (payload.dailyTimes.length > 0) return { valid: false, error: 'dailyTimes vazio weekly.' };
    if (payload.weeklyTimeSlots.length === 0) return { valid: false, error: 'weeklyTimeSlots vazio.' };
    for (const w of payload.weeklyTimeSlots) {
      if (!w || typeof w.day !== 'number' || w.day < 0 || w.day > 6 || !Array.isArray(w.times) || w.times.length === 0 || !w.times.every(isValidTime)) return { valid: false, error: 'weeklyTimeSlots inválido.' };
    }
  }

  return {
    valid: true,
    payload: {
      name: payload.name.trim(),
      message: payload.message,
      targets: payload.targets,
      scheduleType: payload.scheduleType,
      scheduledAt: parsedScheduledAt,
      dailyTimes: payload.dailyTimes,
      weeklyTimeSlots: payload.weeklyTimeSlots,
      media: payload.media,
      fallbackName: payload.fallbackName.trim(),
      deliveryOptions: payload.deliveryOptions
    }
  };
}

async function startServer() {
  authService.init();
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  const io = new SocketIOServer(server);
  app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'North Code Zap' }));

  instanceManager.setSocketIO(io);
  schedulerService.setSocketIO(io);

  io.use((socket, next) => {
    const token = getCookieFromSocket(socket, 'ncz_session');
    if (!token) return next(new Error('Authentication error'));
    
    const session = authService.getSessionByToken(token);
    if (!session) return next(new Error('Authentication error'));
    
    const user = authService.getUser(session.userId);
    if (!user) return next(new Error('Authentication error'));
    const workspace = authService.getWorkspace(user.workspaceId);
    if (!workspace) return next(new Error('Authentication error'));

    socket.data.auth = { sessionId: session.id, user, workspace };
    next();
  });

  io.on('connection', (clientSocket) => {
    clientSocket.join('session:' + clientSocket.data.auth.sessionId);

    clientSocket.on('instance:subscribe', (instanceId) => {
      // Leave all other instance rooms
      Array.from(clientSocket.rooms).forEach(r => {
        if (r.startsWith('instance:') && !r.startsWith('session:')) clientSocket.leave(r);
      });
      if (typeof instanceId === 'string') {
        const runtime = instanceManager.getForWorkspace(instanceId, clientSocket.data.auth.workspace.id);
        if (runtime) {
          clientSocket.join(`instance:${instanceId}`);
          clientSocket.emit('whatsapp:state', runtime.whatsapp.getState());
          clientSocket.emit('whatsapp:messages_list', runtime.whatsapp.getMessages());
          clientSocket.emit('scheduler:schedules_list', schedulerService.getSchedulesForInstance(instanceId));
        }
      }
    });
  });

  // Instances API
  
  // Auth API
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password } = req.body;
      const { token, session } = await authService.register(name, email, password);
      const user = authService.getUser(session.userId);
      const workspace = authService.getWorkspace(user!.workspaceId);
      
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('ncz_session', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30*24*60*60*1000, secure });
      
      res.json({ user: { id: user!.id, name: user!.name, email: user!.email }, workspace: { id: workspace!.id, name: workspace!.name } });
    } catch (e: any) {
      if (e.message === 'Email já cadastrado.') res.status(409).json({ error: e.message });
      else res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const { token, session } = await authService.login(email, password);
      const user = authService.getUser(session.userId);
      const workspace = authService.getWorkspace(user!.workspaceId);
      
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('ncz_session', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30*24*60*60*1000, secure });
      
      res.json({ user: { id: user!.id, name: user!.name, email: user!.email }, workspace: { id: workspace!.id, name: workspace!.name } });
    } catch (e: any) {
      res.status(401).json({ error: e.message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = getCookieFromRequest(req, 'ncz_session');
    if (token) {
      const session = authService.getSessionByToken(token);
      if (session) {
        authService.logoutBySessionId(session.id);
        io.to('session:' + session.id).disconnectSockets(true);
      }
    }
    res.clearCookie('ncz_session', { path: '/', sameSite: 'lax' });
    res.json({ success: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const token = getCookieFromRequest(req, 'ncz_session');
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });
    const session = authService.getSessionByToken(token);
    if (!session) return res.status(401).json({ error: 'Não autenticado.' });
    
    const user = authService.getUser(session.userId);
    if (!user) return res.status(401).json({ error: 'Conta inválida.' });
    const workspace = authService.getWorkspace(user.workspaceId);
    if (!workspace) return res.status(401).json({ error: 'Workspace inválido.' });

    res.json({ user: { id: user.id, name: user.name, email: user.email }, workspace: { id: workspace.id, name: workspace.name } });
  });

  // Auth Middleware
  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = getCookieFromRequest(req, 'ncz_session');
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });
    const session = authService.getSessionByToken(token);
    if (!session) return res.status(401).json({ error: 'Não autenticado.' });
    
    const user = authService.getUser(session.userId);
    if (!user) return res.status(401).json({ error: 'Conta inválida.' });
    const workspace = authService.getWorkspace(user.workspaceId);
    if (!workspace) return res.status(401).json({ error: 'Conta inválida.' });
    
    req.auth = { sessionId: session.id, user, workspace };
    next();
  };

  app.use('/api', requireAuth);

  app.get('/api/instances', (req, res) => {
    res.json(instanceManager.listForWorkspace(req.auth!.workspace.id).map(meta => {
      const runtime = instanceManager.getForWorkspace(meta.id, req.auth!.workspace.id);
      const { workspaceId, ...publicMeta } = meta;
      return {
        ...publicMeta,
        account: runtime?.whatsapp.getState()
      };
    }));
  });

  app.post('/api/instances', (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const meta = instanceManager.createInstance(name, req.auth!.workspace.id);
    const { workspaceId, ...publicMeta } = meta;
    res.status(201).json(publicMeta);
  });

  app.patch('/api/instances/:id', (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const runtime = instanceManager.getForWorkspace(req.params.id, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    const meta = instanceManager.renameInstance(req.params.id, name);
    if (!meta) return res.status(404).json({ error: 'Instância não encontrada' });
    const { workspaceId, ...publicMeta } = meta;
    res.json(publicMeta);
  });

  app.delete('/api/instances/:id', async (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.id, req.auth!.workspace.id);
    if (!runtime) {
      return res.status(404).json({ success: false, error: 'Instância não encontrada' });
    }
    
    const deleted = await instanceManager.deleteInstance(req.params.id);
    if (!deleted) {
      return res.status(500).json({ success: false, error: 'Erro ao remover instância' });
    }
    
    schedulerService.deleteAllForInstance(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/instances/:instanceId/media/files/:fileName', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Instância não encontrada' });
    const fileName = path.basename(req.params.fileName);
    const p = runtime.media.getFilePath(fileName);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Arquivo não encontrado' });
    res.sendFile(p);
  });

  app.post('/api/instances/:instanceId/media/upload', (req, res, next) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ success: false, error: 'Instância não encontrada' });
    next();
  }, (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, error: err.message });
      if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo.' });
      const localPath = req.file.path;
      const url = `/api/instances/${req.params.instanceId}/media/files/${req.file.filename}`;
      res.json({ 
        success: true, 
        media: {
          type: 'image',
          source: 'upload',
          localPath,
          url,
          fileName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size
        } 
      });
    });
  });

  
  app.get('/api/instances/:instanceId/whatsapp/status', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    res.json(runtime.whatsapp.getState());
  });

  app.get('/api/instances/:instanceId/whatsapp/messages', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    res.json(runtime.whatsapp.getMessages());
  });

  app.get('/api/instances/:instanceId/contacts', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    res.json(runtime.contacts.getAll());
  });

  app.get('/api/instances/:instanceId/whatsapp/groups', async (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      const groups = await runtime.whatsapp.getGroups();
      res.json(groups);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/instances/:instanceId/whatsapp/groups/:jid/participants', async (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      const participants = await runtime.whatsapp.getGroupParticipants(req.params.jid);
      res.json(participants);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/instances/:instanceId/whatsapp/messages/send', async (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    const remoteJid = typeof req.body.remoteJid === 'string' ? req.body.remoteJid.trim() : '';
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!remoteJid || !text) return res.status(400).json({ success: false, error: 'Dados inválidos' });
    try {
      const result = await runtime.whatsapp.sendTextMessage(remoteJid, text);
      if (result.success) res.json(result);
      else res.status(400).json(result);
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/instances/:instanceId/whatsapp/connect', async (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      await runtime.whatsapp.connect();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/instances/:instanceId/whatsapp/disconnect', async (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      await runtime.whatsapp.disconnect();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  
  // Audiences API
  app.get('/api/instances/:instanceId/audiences', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    res.json(runtime.audiences.getState());
  });

  app.post('/api/instances/:instanceId/audiences/tags', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      if (typeof req.body.name !== 'string') return res.status(400).json({ error: 'Invalid payload' });
      const tag = runtime.audiences.createTag(req.body.name);
      res.status(201).json(tag);
    } catch (e: any) {
      if (e.message === 'Duplicate tag name') res.status(409).json({ error: e.message });
      else res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/instances/:instanceId/audiences/tags/:tagId', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      if (typeof req.body.name !== 'string') return res.status(400).json({ error: 'Invalid payload' });
      const tag = runtime.audiences.renameTag(req.params.tagId, req.body.name);
      res.json(tag);
    } catch (e: any) {
      if (e.message === 'Tag not found') res.status(404).json({ error: e.message });
      else if (e.message === 'Duplicate tag name') res.status(409).json({ error: e.message });
      else res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/instances/:instanceId/audiences/tags/:tagId', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      runtime.audiences.deleteTag(req.params.tagId);
      res.json({ success: true });
    } catch (e: any) {
      if (e.message === 'Tag not found') res.status(404).json({ error: e.message });
      else res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/instances/:instanceId/audiences/tags/:tagId/contacts', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      if (!Array.isArray(req.body.jids)) return res.status(400).json({ error: 'Invalid payload' });
      runtime.audiences.addTagToContacts(req.params.tagId, req.body.jids);
      res.json({ success: true });
    } catch (e: any) {
      if (e.message === 'Tag not found') res.status(404).json({ error: e.message });
      else res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/instances/:instanceId/audiences/tags/:tagId/contacts', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      if (!Array.isArray(req.body.jids)) return res.status(400).json({ error: 'Invalid payload' });
      runtime.audiences.removeTagFromContacts(req.params.tagId, req.body.jids);
      res.json({ success: true });
    } catch (e: any) {
      if (e.message === 'Tag not found') res.status(404).json({ error: e.message });
      else res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/instances/:instanceId/audiences/lists', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      if (typeof req.body.name !== 'string' || !Array.isArray(req.body.contactJids)) {
        return res.status(400).json({ error: 'Invalid payload' });
      }
      const list = runtime.audiences.createList(req.body.name, req.body.contactJids);
      res.status(201).json(list);
    } catch (e: any) {
      if (e.message === 'Duplicate list name') res.status(409).json({ error: e.message });
      else res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/instances/:instanceId/audiences/lists/:listId', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      if (typeof req.body.name !== 'string') return res.status(400).json({ error: 'Invalid payload' });
      const list = runtime.audiences.renameList(req.params.listId, req.body.name);
      res.json(list);
    } catch (e: any) {
      if (e.message === 'List not found') res.status(404).json({ error: e.message });
      else if (e.message === 'Duplicate list name') res.status(409).json({ error: e.message });
      else res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/instances/:instanceId/audiences/lists/:listId/contacts', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      if (!Array.isArray(req.body.contactJids)) return res.status(400).json({ error: 'Invalid payload' });
      const list = runtime.audiences.updateListContacts(req.params.listId, req.body.contactJids);
      res.json(list);
    } catch (e: any) {
      if (e.message === 'List not found') res.status(404).json({ error: e.message });
      else res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/instances/:instanceId/audiences/lists/:listId', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      runtime.audiences.deleteList(req.params.listId);
      res.json({ success: true });
    } catch (e: any) {
      if (e.message === 'List not found') res.status(404).json({ error: e.message });
      else res.status(400).json({ error: e.message });
    }
  });


  app.get('/api/instances/:instanceId/schedules', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, schedules: schedulerService.getSchedulesForInstance(req.params.instanceId) });
  });

  app.post('/api/instances/:instanceId/schedules', (req, res) => {
    try {
      const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
      if (!runtime) return res.status(404).json({ error: 'Not found' });
      const validation = validateSchedulePayload(req.body);
      if (validation.valid === false) return res.status(400).json({ success: false, error: validation.error });
      if (validation.payload.media?.source === 'upload') {
        if (!runtime.media.fileExists(validation.payload.media.localPath)) {
          return res.status(400).json({ success: false, error: 'Mídia de upload inválida para esta instância.' });
        }
      }
      const schedule = schedulerService.create(req.params.instanceId, validation.payload);
      res.status(201).json({ success: true, schedule });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.put('/api/instances/:instanceId/schedules/:id', (req, res) => {
    try {
      const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
      if (!runtime) return res.status(404).json({ error: 'Not found' });
      const validation = validateSchedulePayload(req.body);
      if (validation.valid === false) return res.status(400).json({ success: false, error: validation.error });
      if (validation.payload.media?.source === 'upload') {
        if (!runtime.media.fileExists(validation.payload.media.localPath)) {
          return res.status(400).json({ success: false, error: 'Mídia de upload inválida para esta instância.' });
        }
      }
      const updated = schedulerService.update(req.params.id, req.params.instanceId, validation.payload, runtime.media);
      if (!updated) return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
      res.json({ success: true, schedule: updated });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.delete('/api/instances/:instanceId/schedules/:id', (req, res) => {
    try {
      const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
      if (!runtime) return res.status(404).json({ error: 'Not found' });
      const success = schedulerService.delete(req.params.id, req.params.instanceId, runtime.media);
      if (!success) return res.status(404).json({ success: false, error: 'Não encontrado' });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/instances/:instanceId/schedules/:id/pause', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    const schedule = schedulerService.pause(req.params.id, req.params.instanceId);
    if (!schedule) return res.status(404).json({ success: false, error: 'Não encontrado' });
    res.json({ success: true, schedule });
  });

  app.post('/api/instances/:instanceId/schedules/:id/resume', (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    const schedule = schedulerService.resume(req.params.id, req.params.instanceId);
    if (!schedule) return res.status(404).json({ success: false, error: 'Não encontrado' });
    res.json({ success: true, schedule });
  });

  app.post('/api/instances/:instanceId/schedules/:id/run-now', async (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.instanceId, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ error: 'Not found' });
    try {
      const result = await schedulerService.runNow(req.params.id, req.params.instanceId);
      if (!result.success) return res.status(400).json(result);
      res.json(result);
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Init manager
  await instanceManager.init();
  schedulerService.init();
  schedulerService.startLoop();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
