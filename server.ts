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
  app.get('/api/schedules', (req, res) => {
    res.json(schedulerService.getAll());
  });

  app.post('/api/schedules', (req, res) => {
    try {
      const {
        name,
        message,
        targets,
        scheduleType,
        scheduledAt,
        dailyTimes,
        weeklyTimeSlots,
        media,
        weeklyDays,
        timeOfDay,
        fallbackName,
        deliveryOptions,
      } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Nome do agendamento é obrigatório.' });
      }

      const hasText = Boolean(message && typeof message === 'string' && message.trim().length > 0);
      const hasMedia = Boolean(
        media &&
          media.type === 'image' &&
          (media.source === 'upload' ? Boolean(media.localPath) : Boolean(media.url))
      );

      if (!hasText && !hasMedia) {
        return res.status(400).json({
          success: false,
          error: 'O agendamento precisa ter pelo menos uma mensagem de texto ou uma imagem.',
        });
      }

      if (!Array.isArray(targets) || targets.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: 'Pelo menos um destinatário é obrigatório.' });
      }

      if (!['once', 'daily', 'weekly'].includes(scheduleType)) {
        return res.status(400).json({ success: false, error: 'Tipo de agendamento inválido.' });
      }

      const newSchedule = schedulerService.create({
        name,
        message: message || '',
        targets,
        scheduleType,
        scheduledAt: scheduledAt || new Date().toISOString(),
        dailyTimes,
        weeklyTimeSlots,
        media,
        weeklyDays,
        timeOfDay,
        fallbackName,
        deliveryOptions,
      });

      res.status(201).json({ success: true, schedule: newSchedule });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao criar agendamento' });
    }
  });

  app.put('/api/schedules/:id', (req, res) => {
    try {
      const updated = schedulerService.update(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
      }
      res.json({ success: true, schedule: updated });
    } catch (err: any) {
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
