const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const importRestore = `import { RestoreService } from './server/restore.ts';\n`;
content = content.replace(`import { backupService } from './server/backup.ts';`, `import { backupService } from './server/backup.ts';\n${importRestore}`);

const initRestore = `\nconst restoreService = new RestoreService(instanceManager, schedulerService, flowRunner, automationRunner);\n`;
content = content.replace(`const flowRunner = new FlowRunner(instanceManager, schedulerService, flowService);`, `const flowRunner = new FlowRunner(instanceManager, schedulerService, flowService);${initRestore}`);

const middleware = `
  const maintenanceMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.auth && restoreService.isRestoring(req.auth.workspace.id) && !req.path.startsWith('/api/backups')) {
      return res.status(423).json({ error: 'Restauração em andamento.' });
    }
    next();
  };
`;

content = content.replace(`const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {`, `${middleware}\n  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {`);

content = content.replace(`app.use('/api', requireAuth);`, `app.use('/api', requireAuth, maintenanceMiddleware);`);


const endpoints = `
  app.post('/api/backups/inspect', upload.single('backup'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Arquivo não fornecido.' });
      const buffer = fs.readFileSync(req.file.path);
      const result = restoreService.inspectBackup(buffer);
      // clean up tmp upload file
      fs.unlinkSync(req.file.path);
      
      if (result.manifest.workspaceId !== req.auth!.workspace.id) {
        return res.status(400).json({ error: 'Este backup pertence a outro workspace e não pode ser restaurado nesta conta.' });
      }

      delete result.backupObj;
      res.json(result);
    } catch (e: any) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: e.message || 'Erro na inspeção.' });
    }
  });

  app.post('/api/backups/restore', upload.single('backup'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Arquivo não fornecido.' });
      if (req.body.confirm !== 'RESTORE' && req.body.confirm !== 'true') {
        return res.status(400).json({ error: 'Confirmação ausente.' });
      }
      const buffer = fs.readFileSync(req.file.path);
      const result = await restoreService.restoreBackup(req.auth!.workspace.id, req.auth!.user.id, buffer);
      
      fs.unlinkSync(req.file.path);
      res.json(result);
    } catch (e: any) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(e.message.includes('Aguarde') ? 409 : 500).json({ error: e.message || 'Erro no restore.' });
    }
  });
`;

content = content.replace(`app.post('/api/backups/export',`, `${endpoints}\n  app.post('/api/backups/export',`);

fs.writeFileSync('server.ts', content);
