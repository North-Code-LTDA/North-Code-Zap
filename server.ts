import type { SchedulePayload } from './src/types';
import express from 'express';
import http from 'http';
import path from 'path';
import multer from 'multer';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { whatsAppService } from './server/whatsapp.ts';
import { schedulerService } from './server/scheduler.ts';
import { contactsService } from './server/contacts.ts';
import { mediaService, MEDIA_DATA_DIR } from './server/media.ts';

// Configure multer storage for media uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MEDIA_DATA_DIR);
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
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não suportado. Envie imagens JPG, PNG ou WebP.'));
    }
  },
});

const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || 'America/Belem';
process.env.TZ = APP_TIMEZONE;

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // Serve uploaded media files
  app.use('/api/media/files', express.static(MEDIA_DATA_DIR));

  // Attach Socket.IO
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Initialize WhatsApp and Scheduler services with Socket.IO
  whatsAppService.setSocketIO(io);
  schedulerService.setSocketIO(io);
  schedulerService.startLoop();

  // REST API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'North Code Zap' });
  });

  // Media Upload Route
  app.post('/api/media/upload', (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        const errorMsg =
          err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
            ? 'A imagem excede o limite máximo permitido de 10 MB.'
            : err.message || 'Falha ao fazer upload da imagem.';
        return res.status(400).json({ success: false, error: errorMsg });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
      }

      const fileUrl = `/api/media/files/${req.file.filename}`;
      const mediaData = {
        type: 'image' as const,
        source: 'upload' as const,
        localPath: req.file.path,
        url: fileUrl,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      };

      console.log(`[Media] Uploaded file: ${req.file.filename} (${Math.round(req.file.size / 1024)} KB)`);
      return res.status(201).json({ success: true, media: mediaData });
    });
  });

  app.get('/api/whatsapp/status', (req, res) => {
    res.json(whatsAppService.getState());
  });

  app.get('/api/whatsapp/messages', (req, res) => {
    res.json(whatsAppService.getMessages());
  });

  app.get('/api/whatsapp/contacts', (req, res) => {
    try {
      const contacts = contactsService.getAll();
      res.json(contacts);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Falha ao buscar contatos' });
    }
  });

  app.get('/api/whatsapp/groups', async (req, res) => {
    try {
      const groups = await whatsAppService.getGroups();
      res.json(groups);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Falha ao buscar grupos' });
    }
  });

  app.get('/api/whatsapp/groups/:jid/participants', async (req, res) => {
    try {
      const { jid } = req.params;
      const data = await whatsAppService.getGroupParticipants(jid);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Falha ao buscar participantes do grupo' });
    }
  });

  app.post('/api/whatsapp/messages/send', async (req, res) => {
    try {
      const { remoteJid, text } = req.body || {};

      if (!remoteJid || typeof remoteJid !== 'string' || !remoteJid.trim()) {
        return res.status(400).json({ success: false, error: 'Destinatário inválido.' });
      }

      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ success: false, error: 'Mensagem não pode estar vazia.' });
      }

      const currentState = whatsAppService.getState();
      if (currentState.status !== 'connected') {
        return res.status(400).json({ success: false, error: 'WhatsApp não está conectado.' });
      }

      const result = await whatsAppService.sendTextMessage(remoteJid, text);
      if (!result.success) {
        return res.status(500).json(result);
      }

      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || 'Erro interno ao processar envio de mensagem.',
      });
    }
  });

  app.post('/api/whatsapp/connect', async (req, res) => {
    try {
      await whatsAppService.connect();
      res.json({ success: true, message: 'Conexão iniciada' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao conectar' });
    }
  });

  app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
      await whatsAppService.disconnect(true);
      res.json({ success: true, message: 'Desconectado com sucesso' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao desconectar' });
    }
  });

  // Schedule API Routes
  app.get('/api/scheduler/config', (req, res) => {
    res.json({ timezone: process.env.TZ || 'America/Belem' });
  });

  app.get('/api/schedules', (req, res) => {
    res.json(schedulerService.getAll());
  });

  function isValidTime(t: any): boolean {
    return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  }

  function validateDaily(times: any[]): boolean {
    if (!Array.isArray(times) || times.length === 0) return false;
    return times.every(isValidTime);
  }

  function validateWeekly(slots: any[]): boolean {
    if (!Array.isArray(slots) || slots.length === 0) return false;
    return slots.every(s => 
      typeof s === 'object' && s !== null &&
      Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 &&
      Array.isArray(s.times) && s.times.length > 0 &&
      s.times.every(isValidTime)
    );
  }


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

    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      return { valid: false, error: 'Nome do agendamento é obrigatório e deve ser uma string não vazia.' };
    }

    if (typeof payload.message !== 'string') {
      return { valid: false, error: 'Campo message deve ser uma string.' };
    }

    if (typeof payload.fallbackName !== 'string' || !payload.fallbackName.trim()) {
      return { valid: false, error: 'Campo fallbackName é obrigatório e deve ser uma string não vazia.' };
    }

    let validMedia = false;
    if (payload.media === null) {
      validMedia = true;
    } else if (typeof payload.media === 'object' && payload.media !== null) {
      if (payload.media.type === 'image') {
        if (payload.media.source === 'upload') {
          if (typeof payload.media.localPath === 'string' && payload.media.localPath.trim().length > 0) {
            validMedia = true;
          }
        } else if (payload.media.source === 'url') {
          if (typeof payload.media.url === 'string' && /^https?:\/\//i.test(payload.media.url)) {
            validMedia = true;
          }
        }
      }
    }

    if (!validMedia) {
      return { valid: false, error: 'Mídia inválida.' };
    }

    const hasText = payload.message.trim().length > 0;
    const hasMedia = payload.media !== null;

    if (!hasText && !hasMedia) {
      return { valid: false, error: 'O agendamento precisa ter pelo menos uma mensagem de texto ou uma imagem.' };
    }

    if (!Array.isArray(payload.targets) || payload.targets.length === 0) {
      return { valid: false, error: 'Pelo menos um destinatário é obrigatório.' };
    }

    const validSources = ['directory', 'manual', 'import', 'group_member', 'group'];
    for (const t of payload.targets) {
      if (t.type !== 'person' && t.type !== 'group') return { valid: false, error: 'Tipo de destinatário inválido.' };
      if (typeof t.jid !== 'string' || !t.jid.trim()) return { valid: false, error: 'JID de destinatário inválido.' };
      if (typeof t.label !== 'string' || !t.label.trim()) return { valid: false, error: 'Label de destinatário inválido.' };
      if (!validSources.includes(t.source)) return { valid: false, error: 'Source de destinatário inválido.' };
      
      if (t.type === 'group' && t.source !== 'group') return { valid: false, error: 'Source de grupo inválido.' };
      if (t.source === 'group_member' && t.type !== 'person') return { valid: false, error: 'Source de group_member deve ser person.' };
      if (t.source === 'directory' && t.type !== 'person') return { valid: false, error: 'Source de directory deve ser person.' };
      if (t.source === 'manual' && t.type !== 'person') return { valid: false, error: 'Source de manual deve ser person.' };
      if (t.source === 'import' && t.type !== 'person') return { valid: false, error: 'Source de import deve ser person.' };
    }

    if (!payload.deliveryOptions || typeof payload.deliveryOptions !== 'object') {
      return { valid: false, error: 'Opções de entrega ausentes ou inválidas.' };
    }
    const dOpt = payload.deliveryOptions;
    if (typeof dOpt.intervalBetweenMessagesMs !== 'number' || !Number.isFinite(dOpt.intervalBetweenMessagesMs) || dOpt.intervalBetweenMessagesMs < 1000) {
      return { valid: false, error: 'Intervalo de entrega inválido.' };
    }
    if (typeof dOpt.batchPauseEnabled !== 'boolean') {
      return { valid: false, error: 'batchPauseEnabled inválido.' };
    }
    if (typeof dOpt.batchSize !== 'number' || !Number.isInteger(dOpt.batchSize) || dOpt.batchSize < 1) {
      return { valid: false, error: 'batchSize inválido.' };
    }
    if (typeof dOpt.batchPauseMs !== 'number' || !Number.isFinite(dOpt.batchPauseMs) || dOpt.batchPauseMs < 60000) {
      return { valid: false, error: 'batchPauseMs inválido.' };
    }

    if (!['once', 'daily', 'weekly'].includes(payload.scheduleType)) {
      return { valid: false, error: 'Tipo de agendamento inválido.' };
    }

    if (!Array.isArray(payload.dailyTimes)) return { valid: false, error: 'dailyTimes deve ser um Array.' };
    if (!Array.isArray(payload.weeklyTimeSlots)) return { valid: false, error: 'weeklyTimeSlots deve ser um Array.' };

    let parsedScheduledAt = payload.scheduledAt;

    if (payload.scheduleType === 'once') {
      if (typeof payload.scheduledAt !== 'string') {
        return { valid: false, error: 'Informe uma data e horário válidos para o agendamento único.' };
      }
      const parsedDate = new Date(payload.scheduledAt);
      if (isNaN(parsedDate.getTime())) {
        return { valid: false, error: 'Data e horário inválidos.' };
      }
      if (parsedDate.getTime() <= Date.now()) {
        return { valid: false, error: 'O horário do agendamento deve estar no futuro.' };
      }
      if (payload.dailyTimes.length > 0) return { valid: false, error: 'dailyTimes deve ser vazio para once.' };
      if (payload.weeklyTimeSlots.length > 0) return { valid: false, error: 'weeklyTimeSlots deve ser vazio para once.' };
      parsedScheduledAt = parsedDate.toISOString();
    } else if (payload.scheduleType === 'daily') {
      if (payload.scheduledAt !== null) return { valid: false, error: 'scheduledAt deve ser null para daily.' };
      if (payload.dailyTimes.length === 0) return { valid: false, error: 'Adicione pelo menos um horário diário válido.' };
      if (!validateDaily(payload.dailyTimes)) return { valid: false, error: 'Adicione pelo menos um horário diário válido.' };
      if (payload.weeklyTimeSlots.length > 0) return { valid: false, error: 'weeklyTimeSlots deve ser vazio para daily.' };
    } else if (payload.scheduleType === 'weekly') {
      if (payload.scheduledAt !== null) return { valid: false, error: 'scheduledAt deve ser null para weekly.' };
      if (payload.dailyTimes.length > 0) return { valid: false, error: 'dailyTimes deve ser vazio para weekly.' };
      if (payload.weeklyTimeSlots.length === 0) return { valid: false, error: 'Configure pelo menos um dia e horário semanal válido.' };
      if (!validateWeekly(payload.weeklyTimeSlots)) return { valid: false, error: 'Configure pelo menos um dia e horário semanal válido.' };
    }

    const validPayload: SchedulePayload = {
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
    };

    return {
      valid: true,
      payload: validPayload
    };
  }
  app.post('/api/schedules', (req, res) => {
    try {
      const validation = validateSchedulePayload(req.body);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: (validation as any).error });
      }

      const schedule = schedulerService.create((validation as any).payload);
      res.status(201).json({ success: true, schedule });
    } catch (err: any) {
      console.error('[API] create schedule error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Falha ao criar agendamento' });
    }
  });

  app.put('/api/schedules/:id', (req, res) => {
    try {
      const validation = validateSchedulePayload(req.body);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: (validation as any).error });
      }

      const updated = schedulerService.update(req.params.id, (validation as any).payload);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
      }
      res.json({ success: true, schedule: updated });
    } catch (err: any) {
      console.error('[API] update schedule error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Falha ao atualizar agendamento' });
    }
  });

  app.delete('/api/schedules/:id', (req, res) => {
    const scheduleId = req.params.id;
    console.log(`[Scheduler] delete requested schedule=${scheduleId}`);
    try {
      const deleted = schedulerService.delete(scheduleId);
      if (!deleted) {
        console.warn(`[Scheduler] delete failed schedule=${scheduleId} reason=not_found`);
        return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
      }
      res.json({ success: true, message: 'Agendamento excluído com sucesso' });
    } catch (err: any) {
      console.error(`[Scheduler] delete failed schedule=${scheduleId} reason=${err?.message || err}`);
      res.status(500).json({ success: false, error: err?.message || 'Falha ao excluir agendamento' });
    }
  });

  app.post('/api/schedules/:id/pause', (req, res) => {
    try {
      const paused = schedulerService.pause(req.params.id);
      if (!paused) {
        return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
      }
      res.json({ success: true, schedule: paused });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao pausar agendamento' });
    }
  });

  app.post('/api/schedules/:id/resume', (req, res) => {
    try {
      const resumed = schedulerService.resume(req.params.id);
      if (!resumed) {
        return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
      }
      res.json({ success: true, schedule: resumed });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao retomar agendamento' });
    }
  });

  app.post('/api/schedules/:id/run-now', async (req, res) => {
    try {
      const result = await schedulerService.runNow(req.params.id);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao executar agendamento' });
    }
  });

  // Vite middleware for development vs static build for production
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
    console.log(`[North Code Zap] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[North Code Zap] Fatal server error:', err);
  process.exit(1);
});
