const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// 1. Move `app.use('/api', requireAuth);` to after public auth routes and health, replacing `app.use('/api/instances', requireAuth);`
code = code.replace(
  /app\.use\('\/api\/instances', requireAuth\);/,
  `app.use('/api', requireAuth);`
);

// 2. Fix /api/auth/me to properly check user and workspace before accessing workspaceId
code = code.replace(
  /app\.get\('\/api\/auth\/me', \(req, res\) => \{[\s\S]*?res\.json\(\{ user: \{ id: user!\.id, name: user!\.name, email: user!\.email \}, workspace: \{ id: workspace!\.id, name: workspace!\.name \} \}\);\n  \}\);/,
  `app.get('/api/auth/me', (req, res) => {
    const token = getCookieFromRequest(req, 'ncz_session');
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });
    const session = authService.getSessionByToken(token);
    if (!session) return res.status(401).json({ error: 'Não autenticado.' });
    
    const user = authService.getUser(session.userId);
    if (!user) return res.status(401).json({ error: 'Conta inválida.' });
    const workspace = authService.getWorkspace(user.workspaceId);
    if (!workspace) return res.status(401).json({ error: 'Workspace inválido.' });

    res.json({ user: { id: user.id, name: user.name, email: user.email }, workspace: { id: workspace.id, name: workspace.name } });
  });`
);

// 3. Fix requireAuth to properly check user before workspace
code = code.replace(
  /const requireAuth = \(req: express\.Request, res: express\.Response, next: express\.NextFunction\) => \{[\s\S]*?next\(\);\n  \};/,
  `const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Permitir /api/health passar direto (embora devesse estar antes, mas caso caia aqui)
    if (req.path === '/health') return next();

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
  };`
);

// 4. Update POST /api/auth/logout to clearCookie correctly
code = code.replace(
  /res\.clearCookie\('ncz_session'\);/,
  `res.clearCookie('ncz_session', { path: '/', sameSite: 'lax' });`
);

// 5. Update GET /api/instances to listForWorkspace and strip workspaceId
code = code.replace(
  /app\.get\('\/api\/instances', \(req, res\) => \{[\s\S]*?\}\)\);\n  \}\);/,
  `app.get('/api/instances', (req, res) => {
    res.json(instanceManager.listForWorkspace(req.auth!.workspace.id).map(meta => {
      const runtime = instanceManager.getForWorkspace(meta.id, req.auth!.workspace.id);
      const { workspaceId, ...publicMeta } = meta;
      return {
        ...publicMeta,
        account: runtime?.whatsapp.getState()
      };
    }));
  });`
);

// 6. Update DELETE /api/instances/:id to check ownership
code = code.replace(
  /app\.delete\('\/api\/instances\/:id', async \(req, res\) => \{\n    await instanceManager\.deleteInstance\(req\.params\.id\);\n    schedulerService\.deleteAllForInstance\(req\.params\.id\);\n    res\.json\(\{ success: true \}\);\n  \}\);/,
  `app.delete('/api/instances/:id', async (req, res) => {
    const runtime = instanceManager.getForWorkspace(req.params.id, req.auth!.workspace.id);
    if (!runtime) return res.status(404).json({ success: false, error: 'Instância não encontrada' });
    
    await instanceManager.deleteInstance(req.params.id);
    schedulerService.deleteAllForInstance(req.params.id);
    res.json({ success: true });
  });`
);

// 7. Re-apply Socket.IO middleware logic which was correct but let's make sure it handles user correctly
code = code.replace(
  /io\.use\(\(socket, next\) => \{[\s\S]*?next\(\);\n  \}\);/,
  `io.use((socket, next) => {
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
  });`
);

// 8. Fix disconnectSockets in auth logout
code = code.replace(
  /io\.to\(`session:\$\{session\.id\}`\)\.disconnectSockets\(\);/,
  `io.to(\`session:\$\{session.id\}\`).disconnectSockets(true);`
);

fs.writeFileSync('server.ts', code);
