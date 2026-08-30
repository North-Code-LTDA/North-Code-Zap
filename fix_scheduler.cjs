const fs = require('fs');
let content = fs.readFileSync('server/scheduler.ts', 'utf-8');

// 1. In processDueSchedules, check suspended workspace before doing anything.
content = content.replace(
  `      if (dueTime <= now) {
        // Check if overdue beyond grace period`,
  `      if (dueTime <= now) {
        const inst = this.instanceManager.get(schedule.instanceId);
        if (inst && this.suspendedWorkspaces.has(inst.metadata.workspaceId)) {
          continue;
        }

        // Check if overdue beyond grace period`
);

// 2. Extract validation logic into `validatePersistedSchedule`
const loadSchedulesLogic = `
  private validatePersistedSchedule(s: any): boolean {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;

    const requiredFields = [
      'id', 'instanceId', 'name', 'message', 'targets', 'scheduleType',
      'scheduledAt', 'nextRunAt', 'dailyTimes', 'weeklyTimeSlots', 'media',
      'fallbackName', 'deliveryOptions', 'status', 'createdAt', 'updatedAt',
      'lastRunAt', 'lastResult'
    ];

    let hasAllFields = true;
    for (const field of requiredFields) {
      if (!Object.prototype.hasOwnProperty.call(s, field)) {
        console.warn(\`[Scheduler] invalid persisted schedule ignored id=\${s.id || 'unknown'} reason=missing_\${field}\`);
        hasAllFields = false;
        break;
      }
    }
    if (!hasAllFields) return false;

    // Base strings
    if (typeof s.id !== 'string' || s.id.trim() === '') { console.warn(\`[Scheduler] invalid persisted schedule ignored id=unknown reason=invalid_id\`); return false; }
    if (typeof s.instanceId !== 'string' || s.instanceId.trim() === '') { console.warn(\`[Scheduler] invalid persisted schedule ignored id=\${s.id} reason=invalid_instanceId\`); return false; }
    if (typeof s.name !== 'string' || s.name.trim() === '') { console.warn(\`[Scheduler] invalid persisted schedule ignored id=\${s.id} reason=invalid_name\`); return false; }
    if (typeof s.message !== 'string') { console.warn(\`[Scheduler] invalid persisted schedule ignored id=\${s.id} reason=invalid_message\`); return false; }
    if (typeof s.fallbackName !== 'string' || s.fallbackName.trim() === '') { console.warn(\`[Scheduler] invalid persisted schedule ignored id=\${s.id} reason=invalid_fallbackName\`); return false; }

    if (!['once', 'daily', 'weekly'].includes(s.scheduleType)) { console.warn(\`[Scheduler] invalid persisted schedule ignored id=\${s.id} reason=invalid_scheduleType\`); return false; }
    const validStatuses = ['active', 'paused', 'completed', 'error', 'running'];
    if (!validStatuses.includes(s.status)) { console.warn(\`[Scheduler] invalid persisted schedule ignored id=\${s.id} reason=invalid_status\`); return false; }

    // Dates
    if (!isValidDateString(s.createdAt)) { console.warn(\`[Scheduler] invalid persisted schedule ignored id=\${s.id} reason=invalid_createdAt\`); return false; }
    return true; // Simplify standard validation for now as the rest is already in calculateNextRunAt anyway if needed, or we just keep existing ones.
  }

  private loadSchedules() {
    try {
      if (!fs.existsSync(SCHEDULES_FILE)) return;
      const raw = fs.readFileSync(SCHEDULES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const validSchedules: ScheduledMessage[] = [];
      const requiredFields = [
        'id', 'instanceId', 'name', 'message', 'targets', 'scheduleType',
        'scheduledAt', 'nextRunAt', 'dailyTimes', 'weeklyTimeSlots', 'media',
        'fallbackName', 'deliveryOptions', 'status', 'createdAt', 'updatedAt',
        'lastRunAt', 'lastResult'
      ];

      for (const s of parsed) {
`;

// Wait, the original loadSchedules already has all the checks. 
// We can just create a regex to extract the body of loadSchedules into a helper method, or rewrite it safely.
// Let's just rewrite reloadWorkspaceFromDisk and validateAndRepairOnStartup.
`
  public reloadWorkspaceFromDisk(workspaceId: string) {
    let allFromDisk = [];
    try {
      if (fs.existsSync(SCHEDULES_FILE)) {
        allFromDisk = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf-8'));
      }
    } catch(e) {
      console.error('[Scheduler] error loading schedules for reload', e);
    }
    
    // Create a temporary instance to parse valid schedules the same way loadSchedules does
    const tempService = new SchedulerService(this.instanceManager);
    tempService.schedules = [];
    // Copy the code of loadSchedules roughly, but just load allFromDisk
    const parsed = allFromDisk;
`;

