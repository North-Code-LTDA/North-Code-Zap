const fs = require('fs');
let content = fs.readFileSync('server/flow-runner.ts', 'utf-8');

content = content.replace(`const due = this.executions.filter(ex => ex.status === 'waiting' && ex.resumeAt && ex.resumeAt <= now);`, `const due = this.executions.filter(ex => ex.status === 'waiting' && ex.resumeAt && ex.resumeAt <= now && !this.suspendedWorkspaces.has(ex.workspaceId));`);

content = content.replace(`for (const ex of nextState) {
      if (ex.status === 'waiting' && ex.resumeAt && ex.resumeAt <= now) {`, `for (const ex of nextState) {
      if (ex.status === 'waiting' && ex.resumeAt && ex.resumeAt <= now && !this.suspendedWorkspaces.has(ex.workspaceId)) {`);

fs.writeFileSync('server/flow-runner.ts', content);
