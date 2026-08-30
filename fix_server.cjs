const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

content = content.replace(`const restoreService = new RestoreService(instanceManager, schedulerService, flowRunner, automationRunner);`, `const restoreService = new RestoreService(instanceManager, schedulerService, flowRunner, automationRunner, flowService);`);

fs.writeFileSync('server.ts', content);
