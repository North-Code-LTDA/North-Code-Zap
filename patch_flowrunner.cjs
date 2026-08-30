const fs = require('fs');
let content = fs.readFileSync('server/flow-runner.ts', 'utf-8');

const insertion = `
  private suspendedWorkspaces = new Set<string>();

  public suspendWorkspace(workspaceId: string) {
    this.suspendedWorkspaces.add(workspaceId);
  }

  public resumeWorkspace(workspaceId: string) {
    this.suspendedWorkspaces.delete(workspaceId);
  }

  public isWorkspaceBusy(workspaceId: string): boolean {
    return this.executions.some(e => e.workspaceId === workspaceId && e.status === 'running');
  }

  public reloadWorkspaceFromDisk(workspaceId: string) {
    const EXECUTIONS_FILE = require('path').join(require('./instances.ts').DATA_DIR, 'flows', 'executions.json');
    if (!fs.existsSync(EXECUTIONS_FILE)) return;
    try {
       const data = JSON.parse(fs.readFileSync(EXECUTIONS_FILE, 'utf8'));
       const workspaceExecutions = data.filter((e) => e.workspaceId === workspaceId);
       
       // Remove old ones for this workspace
       this.executions = this.executions.filter((e) => e.workspaceId !== workspaceId);
       
       // Add the loaded ones
       for (const ex of workspaceExecutions) {
          if (ex.status === 'running') {
             // discard or treat as interrupted
             ex.status = 'interrupted';
             if (!ex.error) ex.error = 'Sistema reiniciado ou restaurado durante a execução';
          }
          this.executions.push(ex);
       }
    } catch(e) {
       console.error('[FlowRunner] Error reloading workspace', e);
    }
  }
`;

content = content.replace('export class FlowRunner {', 'export class FlowRunner {' + insertion);

// Also need to ignore suspended workspaces in `tick` and `dispatchMany`
// In tick:
// const now = Date.now();
// for (const ex of this.executions) {
//   if (ex.status !== 'waiting' || !ex.resumeAt) continue;

content = content.replace(`for (const ex of this.executions) {`, `for (const ex of this.executions) {
      if (this.suspendedWorkspaces.has(ex.workspaceId)) continue;`);

// In dispatchMany:
// for (const event of events) {
//   try {

content = content.replace(`public async dispatchMany(events: AutomationTriggerEvent[]) {
    for (const event of events) {`, `public async dispatchMany(events: AutomationTriggerEvent[]) {
    for (const event of events) {
      if (this.suspendedWorkspaces.has(event.workspaceId)) continue;`);

fs.writeFileSync('server/flow-runner.ts', content);
