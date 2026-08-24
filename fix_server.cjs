const fs = require('fs');
let s = fs.readFileSync('original_server.ts', 'utf-8');

s = s.replace(
  /import \{ authService, User, Workspace, Session \} from '\.\/server\/auth\.ts';/,
  `import { authService, User, Workspace, Session } from './server/auth.ts';\nimport { getCookieFromRequest, getCookieFromSocket } from './server/cookie.ts';`
);

s = s.replace(
  /\/\/ Custom cookie parser middleware[\s\S]*?app\.use\(express\.json\(\)\);/,
  `app.use(express.json());`
);

s = s.replace(
  /const io = new SocketIOServer\(server, \{\n    cors: \{ origin: '\*', methods: \['GET', 'POST'\] \},\n  \}\);/,
  `const io = new SocketIOServer(server);`
);

s = s.replace(
  /io\.on\('connection', \(clientSocket\) \=\> \{[\s\S]*?\}\);\n  \}\);/,
  `// Socket.IO Auth Middleware
  io.use((socket, next) => {
    const token = getCookieFromSocket(socket, 'ncz_session');
    if (!token) return next(new Error('Authentication error'));
    
    const session = authService.getSessionByToken(token);
    if (!session) return next(new Error('Authentication error'));
    
    const user = authService.getUser(session.userId);
    const workspace = authService.getWorkspace(user!.workspaceId);
    if (!user || !workspace) return next(new Error('Authentication error'));

    socket.data.auth = { sessionId: session.id, user, workspace };
    next();
  });

  io.on('connection', (socket) => {
    socket.join('session:' + socket.data.auth.sessionId);

    socket.on('instance:subscribe', (instanceId) => {
      if (typeof instanceId === 'string') {
        socket.rooms.forEach(room => {
          if (room.startsWith('instance:') && !room.startsWith('session:')) socket.leave(room);
        });

        const runtime = instanceManager.getForWorkspace(instanceId, socket.data.auth.workspace.id);
        if (runtime) {
          socket.join(\`instance:\$\{instanceId\}\`);
          socket.emit('whatsapp:state', runtime.whatsapp.getState());
          socket.emit('whatsapp:messages_list', runtime.whatsapp.getMessages());
          socket.emit('scheduler:schedules_list', schedulerService.getSchedulesForInstance(instanceId));
        }
      }
    });
  });`
);

s = s.replace(/req\.cookies\?\.ncz_session/g, `getCookieFromRequest(req, 'ncz_session')`);
s = s.replace(/const token = \(req as any\)\.cookies\?\.ncz_session;/g, `const token = getCookieFromRequest(req, 'ncz_session');`);
s = s.replace(/\(req as any\)\.auth\?\.workspace\.id \|\| ''/g, 'req.auth!.workspace.id');

s = s.replace(
  /res\.json\(instanceManager\.listForWorkspace\(req\.auth!\.workspace\.id\)\)[\s\S]*?\}\);/m,
  `res.json(instanceManager.listForWorkspace(req.auth!.workspace.id).map(meta => {
      const runtime = instanceManager.getForWorkspace(meta.id, req.auth!.workspace.id);
      return {
        ...meta,
        account: runtime?.whatsapp.getState()
      };
    }));
  });`
);

// We need to restore list() logic for /api/instances since original_server.ts might have listForWorkspace or list() depending on when it was captured.
// Wait, original_server.ts was captured AFTER my patches in the previous step? 
