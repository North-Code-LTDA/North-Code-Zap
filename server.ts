import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { whatsAppService } from './server/whatsapp.ts';

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

  // Initialize WhatsApp service with Socket.IO
  whatsAppService.setSocketIO(io);

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
