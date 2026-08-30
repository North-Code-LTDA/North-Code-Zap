const fs = require('fs');
let content = fs.readFileSync('server/restore.ts', 'utf-8');

content = content.replace(`new Set(backup.data.instances.map((i: any) => i.id))`, `new Set<string>(backup.data.instances.map((i: any) => i.id))`);
content = content.replace(`new Set(backup.data.instances.map((i: any) => i.id))`, `new Set<string>(backup.data.instances.map((i: any) => i.id))`);

content = content.replace(`this.this.flowService.init();`, `this.flowService.init();`);
content = content.replace(`flowService.init();`, `this.flowService.init();`);

fs.writeFileSync('server/restore.ts', content);
