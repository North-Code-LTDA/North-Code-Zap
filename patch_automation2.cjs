const fs = require('fs');
let content = fs.readFileSync('server/automation-runner.ts', 'utf-8');

const regex = /public async dispatchMany[\s\S]*?private async dispatch/m;

content = content.replace(regex, `
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

  private async dispatch`);

fs.writeFileSync('server/automation-runner.ts.tmp2', content);
