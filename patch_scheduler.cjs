const fs = require('fs');
let content = fs.readFileSync('server/scheduler.ts', 'utf-8');

const insertion = `
  private suspendedWorkspaces = new Set<string>();

  public suspendWorkspace(workspaceId: string) {
    this.suspendedWorkspaces.add(workspaceId);
  }

  public resumeWorkspace(workspaceId: string) {
    this.suspendedWorkspaces.delete(workspaceId);
  }

  public isWorkspaceBusy(workspaceId: string): boolean {
    for (const scheduleId of this.processingSchedules) {
      const sched = this.schedules.find(s => s.id === scheduleId);
      if (sched) {
        const inst = this.instanceManager.get(sched.instanceId);
        if (inst && inst.metadata.workspaceId === workspaceId) return true;
      }
    }
    for (const sched of this.schedules) {
      if (sched.status === 'running') {
        const inst = this.instanceManager.get(sched.instanceId);
        if (inst && inst.metadata.workspaceId === workspaceId) return true;
      }
    }
    return false;
  }

  public reloadWorkspaceFromDisk(workspaceId: string) {
    let allFromDisk = [];
    try {
      if (fs.existsSync(SCHEDULES_FILE)) {
        allFromDisk = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf-8'));
      }
    } catch(e) {
      console.error('[Scheduler] error loading schedules for reload', e);
    }
    
    const validRestored = [];
    for (const raw of allFromDisk) {
       const inst = this.instanceManager.get(raw.instanceId);
       if (inst && inst.metadata.workspaceId === workspaceId) {
          validRestored.push(raw);
       }
    }

    // Keep schedules from other workspaces
    const otherWorkspaces = this.schedules.filter(s => {
       const inst = this.instanceManager.get(s.instanceId);
       return !inst || inst.metadata.workspaceId !== workspaceId;
    });

    this.schedules = [...otherWorkspaces, ...validRestored];
    this.validateAndRepairOnStartup(); // applies standard cleanup only once more, to all.
  }
`;

content = content.replace('export class SchedulerService {', 'export class SchedulerService {' + insertion);

content = content.replace(`const instance = this.instanceManager.get(schedule.instanceId);`, `const instance = this.instanceManager.get(schedule.instanceId);
        if (instance && this.suspendedWorkspaces.has(instance.metadata.workspaceId)) {
          continue;
        }`);

content = content.replace(`public async runNow(`, `public async runNow(
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
  public async _runNow(`);

fs.writeFileSync('server/scheduler.ts', content);
