const fs = require('fs');
let content = fs.readFileSync('server/restore.ts', 'utf-8');

content = content.replace(`private automationRunner: AutomationRunner`, `private automationRunner: AutomationRunner,
    private flowService: any`);

// There is an error: `'"./flows"' has no exported member named 'flowService'`
// So we should remove `import { flowService } from './flows';`
content = content.replace(`import { flowService } from './flows';`, `// flowService passed via constructor`);

content = content.replace(`flowService.init();`, `this.flowService.init();`);

fs.writeFileSync('server/restore.ts', content);
