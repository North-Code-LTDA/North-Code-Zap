import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { whatsAppService } from './server/whatsapp.ts';
import { schedulerService } from './server/scheduler.ts';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

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

  app.get('/api/whatsapp/status', (req, res) => {
    res.json(whatsAppService.getState());
  });

  app.get('/api/whatsapp/messages', (req, res) => {
    res.json(whatsAppService.getMessages());
  });

  app.get('/api/whatsapp/groups', async (req, res) => {
    try {
      const groups = await whatsAppService.getGroups();
      res.json(groups);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Falha ao buscar grupos' });
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
      const { name, message, targets, scheduleType, scheduledAt, weeklyDays, timeOfDay } =
        req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Nome do agendamento é obrigatório.' });
      }

      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Mensagem não pode estar vazia.' });
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
        message,
        targets,
        scheduleType,
        scheduledAt: scheduledAt || new Date().toISOString(),
        weeklyDays,
        timeOfDay,
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
    try {
      const deleted = schedulerService.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
      }
      res.json({ success: true, message: 'Agendamento excluído' });
    } catch (err: any) {
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
