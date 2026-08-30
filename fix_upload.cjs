const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const backupUpload = `
const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 * 1024 }
});
`;

content = content.replace(`app.post('/api/backups/inspect', upload.single('backup'),`, `${backupUpload}
  app.post('/api/backups/inspect', backupUpload.single('backup'),`);

content = content.replace(`app.post('/api/backups/restore', upload.single('backup'),`, `app.post('/api/backups/restore', backupUpload.single('backup'),`);

content = content.replace(`const buffer = fs.readFileSync(req.file.path);`, `const buffer = req.file.buffer;`);
content = content.replace(`const buffer = fs.readFileSync(req.file.path);`, `const buffer = req.file.buffer;`);
content = content.replace(`fs.unlinkSync(req.file.path);`, ``); // No unlink for memoryStorage
content = content.replace(`fs.unlinkSync(req.file.path);`, ``); 
content = content.replace(`if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);`, ``);
content = content.replace(`if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);`, ``);

fs.writeFileSync('server.ts', content);
