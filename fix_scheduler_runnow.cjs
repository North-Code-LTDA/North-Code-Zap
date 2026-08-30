const fs = require('fs');
let content = fs.readFileSync('server/scheduler.ts', 'utf-8');

// The faulty replacement was:
// public async runNow(
//    id: string,
//    instanceId: string,
//    mediaSvc: MediaService
//  ): Promise<boolean> {
//    const inst = this.instanceManager.get(instanceId);
//    if (inst && this.suspendedWorkspaces.has(inst.metadata.workspaceId)) {
//      throw new Error('Restauração em andamento.');
//    }
//    return this._runNow(id, instanceId, mediaSvc);
//  }
//  public async _runNow(
//    id: string, instanceId: string
//  ): Promise<{ success: boolean; result?: ScheduleLastResult; error?: string }> {

content = content.replace(`public async runNow(
    id: string,
    instanceId: string,
    mediaSvc: MediaService
  ): Promise<boolean> {
    const inst = this.instanceManager.get(instanceId);
    if (inst && this.suspendedWorkspaces.has(inst.metadata.workspaceId)) {
      throw new Error('Restauração em andamento.');
    }
    return this._runNow(id, instanceId, mediaSvc);
  }
  public async _runNow(
    id: string, instanceId: string
  ): Promise<{ success: boolean; result?: ScheduleLastResult; error?: string }> {`, `public async runNow(
    id: string, instanceId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const inst = this.instanceManager.get(instanceId);
    if (inst && this.suspendedWorkspaces.has(inst.metadata.workspaceId)) {
      return { success: false, error: 'Restauração em andamento.' };
    }
    return this._runNow(id, instanceId);
  }
  public async _runNow(
    id: string, instanceId: string
  ): Promise<{ success: boolean; result?: any; error?: string }> {`);

fs.writeFileSync('server/scheduler.ts', content);
