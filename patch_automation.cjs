const fs = require('fs');

let content = fs.readFileSync('server/automation-runner.ts', 'utf-8');

const insertion = `
  private activeDispatches = new Map<string, number>();
  private suspendedWorkspaces = new Set<string>();

  public suspendWorkspace(workspaceId: string) {
    this.suspendedWorkspaces.add(workspaceId);
  }

  public resumeWorkspace(workspaceId: string) {
    this.suspendedWorkspaces.delete(workspaceId);
  }

  public isWorkspaceBusy(workspaceId: string): boolean {
    const count = this.activeDispatches.get(workspaceId) || 0;
    return count > 0;
  }
`;

content = content.replace('export class AutomationRunner {', 'export class AutomationRunner {' + insertion);

content = content.replace('public async dispatchMany(events: AutomationTriggerEvent[]) {', `
  public async dispatchMany(events: AutomationTriggerEvent[]) {
    for (const event of events) {
      if (this.suspendedWorkspaces.has(event.workspaceId)) continue;
      
      const current = this.activeDispatches.get(event.workspaceId) || 0;
      this.activeDispatches.set(event.workspaceId, current + 1);
      
      try {
        await this.dispatch(event);
      } catch (err) {
        console.error('[Automation] Failed to dispatch event:', err);
      } finally {
        const count = this.activeDispatches.get(event.workspaceId) || 0;
        if (count > 0) this.activeDispatches.set(event.workspaceId, count - 1);
      }
    }
  }
`);

// The original dispatchMany also had a loop but we replace it.
// Let's use string manipulation safely.
fs.writeFileSync('server/automation-runner.ts.tmp', content);
