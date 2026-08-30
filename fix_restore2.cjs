const fs = require('fs');
let content = fs.readFileSync('server/restore.ts', 'utf-8');

content = content.replace(`flowService.init();`, `this.flowService.init();`);
content = content.replace(`(s) => backupUserIds.has(s.userId)`, `(s: any) => backupUserIds.has(s.userId)`);
content = content.replace(`(s) => backupUserIds.has(s.userId)`, `(s: any) => backupUserIds.has(s.userId)`);

fs.writeFileSync('server/restore.ts', content);
