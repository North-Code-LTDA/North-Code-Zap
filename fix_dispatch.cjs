const fs = require('fs');
let content = fs.readFileSync('server/flow-runner.ts', 'utf-8');

content = content.replace(`async dispatchMany(events: AutomationTriggerEvent[]) {
    for (const e of events) {`, `async dispatchMany(events: AutomationTriggerEvent[]) {
    for (const e of events) {
      if (this.suspendedWorkspaces.has(e.workspaceId)) continue;`);

fs.writeFileSync('server/flow-runner.ts', content);
