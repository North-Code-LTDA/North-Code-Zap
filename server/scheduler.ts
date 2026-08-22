import fs from 'fs';
import path from 'path';
import type { Server as SocketIOServer } from 'socket.io';
import type { InstanceManager } from './instances';

import { renderMessageTemplate } from '../src/utils/template';
import type { 
  ScheduledMessage,
  ScheduledTarget,
  ScheduleType,
  ScheduleStatus,
  ScheduleLastResult,
  ScheduleExecutionDetail,
  SchedulerProgressEvent,
  DeliveryOptions,
  ScheduledMedia,
  WeeklyTimeSlot,
 SchedulePayload } from "../src/types";

const SCHEDULER_DIR =
  process.env.SCHEDULER_DATA_DIR || path.join(process.cwd(), 'data', 'scheduler');
const SCHEDULES_FILE = path.join(SCHEDULER_DIR, 'schedules.json');
const SCHEDULES_TMP_FILE = path.join(SCHEDULER_DIR, 'schedules.json.tmp');

const SCHEDULE_GRACE_MINUTES = parseInt(process.env.SCHEDULE_GRACE_MINUTES || '30', 10);
const MIN_SEND_INTERVAL_MS = parseInt(process.env.MIN_SEND_INTERVAL_MS || '1500', 10);
const MAX_SEND_RETRIES = parseInt(process.env.MAX_SEND_RETRIES || '2', 10);
const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || 'America/Belem';
process.env.TZ = APP_TIMEZONE;
const LOOP_INTERVAL_MS = 10000; // 10 seconds check loop

/**
 * Utility to sort and deduplicate HH:mm times
 */
function normalizeTimeList(times: string[] | undefined): string[] {
  if (!Array.isArray(times) || times.length === 0) return [];
  const valid = times
    .map((t) => (t || '').trim())
    .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
  const unique = Array.from(new Set(valid));
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

/**
 * Utility to normalize weekly time slots
 */
function normalizeWeeklySlots(
  slots?: WeeklyTimeSlot[]
): WeeklyTimeSlot[] {
  if (Array.isArray(slots) && slots.length > 0) {
    return slots
      .filter((s) => typeof s.day === 'number' && s.day >= 0 && s.day <= 6)
      .map((s) => ({
        day: s.day,
        times: normalizeTimeList(s.times),
      }))
      .filter(s => s.times.length > 0)
      .sort((a, b) => a.day - b.day);
  }
  return [];
}

export class SchedulerService {
  private schedules: ScheduledMessage[] = [];
  private processingSchedules: Set<string> = new Set();
  private io: SocketIOServer | null = null;
  private instanceManager: InstanceManager;
  private loopTimer: NodeJS.Timeout | null = null;

  
  constructor(instanceManager: InstanceManager) {
    this.instanceManager = instanceManager;
    this.ensureDirectory();
    this.loadSchedules();
  }

  private ensureDirectory() {
    try {
      if (!fs.existsSync(SCHEDULER_DIR)) {
        fs.mkdirSync(SCHEDULER_DIR, { recursive: true });
      }
    } catch (err: any) {
      console.error('[Scheduler] error creating scheduler directory:', err?.message || err);
    }
  }

  private loadSchedules() {
    this.schedules = [];
    try {
      if (fs.existsSync(SCHEDULES_FILE)) {
        const raw = fs.readFileSync(SCHEDULES_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const s of parsed) {
            // Strict Schema Validation
            const hasOwn = (obj: any, prop: string) => Object.prototype.hasOwnProperty.call(obj, prop);
            
            const requiredFields = [
              'id', 'name', 'message', 'targets', 'scheduleType', 'scheduledAt', 'nextRunAt',
              'dailyTimes', 'weeklyTimeSlots', 'media', 'fallbackName', 'deliveryOptions',
              'status', 'createdAt', 'updatedAt', 'lastRunAt', 'lastResult'
            ];

            let hasAllFields = true;
            for (const field of requiredFields) {
              if (!hasOwn(s, field)) {
                hasAllFields = false;
                break;
              }
            }

            if (!hasAllFields) {
              console.warn(`[Scheduler] Ignoring invalid schedule ${s?.id || 'unknown'} (missing required fields)`);
              continue;
            }

            const isValidDateString = (value: unknown): value is string =>
              typeof value === 'string' && !Number.isNaN(new Date(value).getTime());

            const isValidBase =
              typeof s.id === 'string' && s.id.trim().length > 0 &&
              typeof s.name === 'string' && s.name.trim().length > 0 &&
              typeof s.message === 'string' &&
              typeof s.fallbackName === 'string' && s.fallbackName.trim().length > 0 &&
              Array.isArray(s.targets) &&
              ['once', 'daily', 'weekly'].includes(s.scheduleType) &&
              Array.isArray(s.dailyTimes) &&
              Array.isArray(s.weeklyTimeSlots) &&
              typeof s.deliveryOptions === 'object' && s.deliveryOptions !== null &&
              ['active', 'paused', 'running', 'completed', 'error'].includes(s.status) &&
              isValidDateString(s.createdAt) &&
              isValidDateString(s.updatedAt) &&
              (s.nextRunAt === null || isValidDateString(s.nextRunAt)) &&
              (s.lastRunAt === null || isValidDateString(s.lastRunAt)) &&
              (s.lastResult === null || typeof s.lastResult === 'object');

            if (!isValidBase) {
              console.warn(`[Scheduler] Ignoring invalid schedule ${s.id} (base fields invalid)`);
              continue;
            }

            // Delivery options validation
            const delOpt = s.deliveryOptions;
            if (
              typeof delOpt.intervalBetweenMessagesMs !== 'number' || !Number.isFinite(delOpt.intervalBetweenMessagesMs) || delOpt.intervalBetweenMessagesMs < 1000 ||
              typeof delOpt.batchPauseEnabled !== 'boolean' ||
              typeof delOpt.batchSize !== 'number' || !Number.isInteger(delOpt.batchSize) || delOpt.batchSize < 1 ||
              typeof delOpt.batchPauseMs !== 'number' || !Number.isFinite(delOpt.batchPauseMs) || delOpt.batchPauseMs < 60000
            ) {
              console.warn(`[Scheduler] Ignoring invalid schedule ${s.id} (deliveryOptions invalid)`);
              continue;
            }

            // Targets validation
            const validSources = ['directory', 'manual', 'import', 'group_member', 'group'];
            let targetsValid = s.targets.length > 0;
            for (const t of s.targets) {
              if (
                (t.type !== 'person' && t.type !== 'group') ||
                typeof t.jid !== 'string' || !t.jid.trim() ||
                typeof t.label !== 'string' || !t.label.trim() ||
                (!validSources.includes(t.source)) ||
                (t.type === 'group' && t.source !== 'group') ||
                (t.source === 'group_member' && t.type !== 'person') ||
                (t.source === 'directory' && t.type !== 'person') ||
                (t.source === 'manual' && t.type !== 'person') ||
                (t.source === 'import' && t.type !== 'person')
              ) {
                targetsValid = false;
                break;
              }
            }
            if (!targetsValid) {
              console.warn(`[Scheduler] Ignoring invalid schedule ${s.id} (targets invalid)`);
              continue;
            }

            // Media validation
            let mediaValid = false;
            if (s.media === null) {
              mediaValid = true;
            } else if (typeof s.media === 'object' && s.media !== null && s.media.type === 'image') {
              if (s.media.source === 'upload' && typeof s.media.localPath === 'string' && s.media.localPath.trim().length > 0) {
                mediaValid = true;
              } else if (s.media.source === 'url' && typeof s.media.url === 'string' && /^https?:\/\//i.test(s.media.url)) {
                mediaValid = true;
              }
            }
            if (!mediaValid) {
              console.warn(`[Scheduler] Ignoring invalid schedule ${s.id} (media invalid)`);
              continue;
            }

            const hasText = s.message.trim().length > 0;
            const hasMedia = s.media !== null;
            if (!hasText && !hasMedia) {
              console.warn(`[Scheduler] Ignoring invalid schedule ${s.id} (no text and no media)`);
              continue;
            }

            const isValidTime = (t: any) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

            let isValidSpecific = false;
            if (s.scheduleType === 'once') {
              isValidSpecific =
                typeof s.scheduledAt === 'string' &&
                !isNaN(new Date(s.scheduledAt).getTime()) &&
                s.dailyTimes.length === 0 &&
                s.weeklyTimeSlots.length === 0;
            } else if (s.scheduleType === 'daily') {
              isValidSpecific =
                s.scheduledAt === null &&
                s.dailyTimes.length >= 1 &&
                s.dailyTimes.every(isValidTime) &&
                s.weeklyTimeSlots.length === 0;
            } else if (s.scheduleType === 'weekly') {
              isValidSpecific =
                s.scheduledAt === null &&
                s.dailyTimes.length === 0 &&
                s.weeklyTimeSlots.length >= 1 &&
                s.weeklyTimeSlots.every((ws: any) =>
                  typeof ws === 'object' && ws !== null &&
                  Number.isInteger(ws.day) && ws.day >= 0 && ws.day <= 6 &&
                  Array.isArray(ws.times) && ws.times.length > 0 &&
                  ws.times.every(isValidTime)
                );
            }

            if (!isValidSpecific) {
              console.warn(`[Scheduler] Ignoring invalid schedule ${s.id} (type-specific constraints failed)`);
              continue;
            }

            this.schedules.push(s);
          }
          console.log(`[Scheduler] loaded valid schedules=${this.schedules.length}`);
          this.validateAndRepairOnStartup();
          return;
        }
      }
    } catch (err: any) {
      console.error('[Scheduler] error reading schedules file, initializing empty:', err?.message);
    }
  }

  private saveSchedules() {
    this.ensureDirectory();
    try {
      const data = JSON.stringify(this.schedules, null, 2);
      fs.writeFileSync(SCHEDULES_TMP_FILE, data, 'utf-8');
      fs.renameSync(SCHEDULES_TMP_FILE, SCHEDULES_FILE);
    } catch (err: any) {
      console.error('[Scheduler] error saving schedules file:', err?.message || err);
    }
  }

  public setSocketIO(io: SocketIOServer) {
    this.io = io;
    this.setupSocketEvents();
  }

  private setupSocketEvents() {
    if (!this.io) return;
    this.io.on('connection', (clientSocket) => {
      // The frontend will now explicitly request schedules when selecting an instance.
    });
  }

  private emitUpdated() {
    if (!this.io) return;
    const byInstance = new Map<string, typeof this.schedules>();
    for (const s of this.schedules) {
      if (!byInstance.has(s.instanceId)) {
        byInstance.set(s.instanceId, []);
      }
      byInstance.get(s.instanceId)!.push(s);
    }
    for (const [instanceId, schedules] of byInstance.entries()) {
      this.io.to(`instance:${instanceId}`).emit('scheduler:updated', schedules);
      this.io.to(`instance:${instanceId}`).emit('scheduler:schedules_list', schedules);
    }
  }

  public startLoop() {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
    }
    console.log(`[Scheduler] started (timezone=${APP_TIMEZONE}, loop=${LOOP_INTERVAL_MS}ms)`);
    this.loopTimer = setInterval(() => {
      this.processDueSchedules().catch((err) => {
        console.error('[Scheduler] error in processDueSchedules loop:', err);
      });
    }, LOOP_INTERVAL_MS);
  }

  public stopLoop() {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
      console.log('[Scheduler] stopped');
    }
  }

  public getAll(): ScheduledMessage[] {
    return this.schedules;
  }
  
  public getSchedulesForInstance(instanceId: string): ScheduledMessage[] {
    return this.schedules.filter(s => s.instanceId === instanceId);
  }

  public getById(id: string): ScheduledMessage | undefined {
    return this.schedules.find((s) => s.id === id);
  }

  public create(instanceId: string, data: SchedulePayload): ScheduledMessage {
    const id = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const normalizedDailyTimes =
      data.scheduleType === 'daily'
        ? normalizeTimeList(data.dailyTimes)
        : [];

    const normalizedWeeklySlots =
      data.scheduleType === 'weekly'
        ? normalizeWeeklySlots(data.weeklyTimeSlots)
        : [];

    const tempSchedule: ScheduledMessage = {
      id,
      name: data.name,
      message: data.message,
      targets: data.targets,
      scheduleType: data.scheduleType,
      scheduledAt: data.scheduleType === 'once' ? data.scheduledAt : null,
      nextRunAt: null,
      dailyTimes: normalizedDailyTimes,
      weeklyTimeSlots: normalizedWeeklySlots,
      media: data.media,
      fallbackName: data.fallbackName,
      deliveryOptions: data.deliveryOptions,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
      lastRunAt: null,
      lastResult: null,
      instanceId,
    };
    tempSchedule.nextRunAt = this.calculateNextRunAt(tempSchedule);

    this.schedules.push(tempSchedule);
    this.saveSchedules();
    this.emitUpdated();
    
    console.log(
      `[Scheduler] created schedule=${tempSchedule.id} name="${tempSchedule.name}" nextRunAt=${tempSchedule.nextRunAt}`
    );

    return tempSchedule;
  }

  public update(id: string, instanceId: string, data: SchedulePayload, mediaSvc: any): ScheduledMessage | null {
    const index = this.schedules.findIndex((s) => s.id === id && s.instanceId === instanceId);
    if (index === -1) return null;

    const current = this.schedules[index];
    const previousMedia = current.media;

    const updatedDailyTimes = data.scheduleType === 'daily' ? normalizeTimeList(data.dailyTimes) : [];
    const updatedWeeklySlots = data.scheduleType === 'weekly' ? normalizeWeeklySlots(data.weeklyTimeSlots) : [];

    const updated: ScheduledMessage = {
      id: current.id,
      name: data.name,
      message: data.message,
      targets: data.targets,
      scheduleType: data.scheduleType,
      scheduledAt: data.scheduleType === 'once' ? data.scheduledAt : null,
      dailyTimes: updatedDailyTimes,
      weeklyTimeSlots: updatedWeeklySlots,
      media: data.media,
      fallbackName: data.fallbackName,
      deliveryOptions: data.deliveryOptions,
      status: current.status,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      lastRunAt: current.lastRunAt,
      lastResult: current.lastResult,
      nextRunAt: current.nextRunAt,
      instanceId,
    };
    if (updated.status === 'active') {
      updated.nextRunAt = this.calculateNextRunAt(updated);
    }

    this.schedules[index] = updated;
    this.saveSchedules();
    this.emitUpdated();

    // If media was replaced or removed, clean up previous file if unreferenced
    if (
      previousMedia?.source === 'upload' &&
      previousMedia.localPath &&
      previousMedia.localPath !== updated.media?.localPath
    ) {
      mediaSvc.deleteMediaIfUnreferenced(previousMedia.localPath, this.schedules);
    }

    console.log(`[Scheduler] updated schedule=${updated.id} name="${updated.name}"`);
    return updated;
  }

  public delete(id: string, instanceId: string, mediaSvc: any): boolean {
    const targetSchedule = this.schedules.find((s) => s.id === id);
    if (!targetSchedule) {
      console.warn(`[Scheduler] delete failed schedule=${id} reason=not_found`);
      return false;
    }

    const mediaToClean = targetSchedule.media;

    this.schedules = this.schedules.filter((s) => s.id !== id);
    this.saveSchedules();
    this.emitUpdated();
    console.log(`[Scheduler] deleted schedule=${id}`);

    // Cleanup associated uploaded media if no longer referenced
    if (mediaToClean?.source === 'upload' && mediaToClean.localPath) {
      try {
        mediaSvc.deleteMediaIfUnreferenced(mediaToClean.localPath, this.schedules);
      } catch (mediaErr: any) {
        console.warn(`[Scheduler] media cleanup error on delete schedule=${id}:`, mediaErr?.message);
      }
    }

    return true;
  }

  public pause(id: string, instanceId: string): ScheduledMessage | null {
    const schedule = this.schedules.find((s) => s.id === id && s.instanceId === instanceId);
    if (!schedule) return null;

    schedule.status = 'paused';
    schedule.updatedAt = new Date().toISOString();
    this.saveSchedules();
    this.emitUpdated();

    console.log(`[Scheduler] paused schedule=${id}`);
    return schedule;
  }

  public resume(id: string, instanceId: string): ScheduledMessage | null {
    const schedule = this.schedules.find((s) => s.id === id && s.instanceId === instanceId);
    if (!schedule) return null;

    schedule.status = 'active';
    schedule.nextRunAt = this.calculateNextRunAt(schedule);
    schedule.updatedAt = new Date().toISOString();
    this.saveSchedules();
    this.emitUpdated();

    console.log(`[Scheduler] resumed schedule=${id} nextRunAt=${schedule.nextRunAt}`);
    return schedule;
  }

  /**
   * Calculate next run timestamp in ISO format for once, daily, and weekly schedules
   */
  public calculateNextRunAt(schedule: ScheduledMessage, fromDate = new Date()): string | null {
    const nowTime = fromDate.getTime();

    if (schedule.scheduleType === 'once') {
      if (!schedule.scheduledAt) return null;
      const targetTime = new Date(schedule.scheduledAt).getTime();
      if (isNaN(targetTime)) return null;
      return new Date(targetTime).toISOString();
    }

    if (schedule.scheduleType === 'daily') {
      const times = normalizeTimeList(schedule.dailyTimes);
      if (times.length === 0) return null;

      // Check today's configured time slots in ascending order
      for (const timeStr of times) {
        const [hours, minutes] = timeStr.split(':').map((v) => parseInt(v, 10) || 0);
        const candidate = new Date(fromDate);
        candidate.setHours(hours, minutes, 0, 0);

        if (candidate.getTime() > nowTime) {
          return candidate.toISOString();
        }
      }

      // If all times for today have passed, pick the first slot for tomorrow
      const [firstH, firstM] = times[0].split(':').map((v) => parseInt(v, 10) || 0);
      const tomorrowCandidate = new Date(fromDate);
      tomorrowCandidate.setDate(tomorrowCandidate.getDate() + 1);
      tomorrowCandidate.setHours(firstH, firstM, 0, 0);
      return tomorrowCandidate.toISOString();
    }

    if (schedule.scheduleType === 'weekly') {
      const slots = normalizeWeeklySlots(schedule.weeklyTimeSlots);
      if (slots.length === 0) return null;

      // Check next 8 days (covering full upcoming week)
      for (let offset = 0; offset <= 8; offset++) {
        const candidateDate = new Date(fromDate);
        candidateDate.setDate(candidateDate.getDate() + offset);
        const dayOfWeek = candidateDate.getDay(); // 0 = Sunday, 1 = Monday...

        const slotForDay = slots.find((s) => s.day === dayOfWeek);
        if (slotForDay && slotForDay.times.length > 0) {
          const sortedTimes = normalizeTimeList(slotForDay.times);
          for (const timeStr of sortedTimes) {
            const [hours, minutes] = timeStr.split(':').map((v) => parseInt(v, 10) || 0);
            const candidate = new Date(candidateDate);
            candidate.setHours(hours, minutes, 0, 0);

            if (candidate.getTime() > nowTime) {
              return candidate.toISOString();
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Startup verification: handles server restart, grace period, and missed schedules
   */
  private validateAndRepairOnStartup() {
    const now = Date.now();
    const graceMs = SCHEDULE_GRACE_MINUTES * 60 * 1000;
    let modified = false;

    for (const schedule of this.schedules) {
      if (schedule.status === 'running') {
        schedule.status = 'active';
        modified = true;
      }

      if (schedule.status === 'active') {
        const correctNextRunAt = this.calculateNextRunAt(schedule, new Date(now));
        
        if (schedule.scheduleType !== 'once') {
          if (schedule.nextRunAt !== correctNextRunAt) {
            console.log(`[Scheduler] repaired nextRunAt schedule=${schedule.id} timezone=${APP_TIMEZONE} nextRunAt=${correctNextRunAt}`);
            schedule.nextRunAt = correctNextRunAt;
            modified = true;
          }
        } else if (schedule.scheduledAt) {
          const scheduledMs = new Date(schedule.scheduledAt).getTime();
          if (scheduledMs > now) {
             const newIso = new Date(scheduledMs).toISOString();
             if (schedule.nextRunAt !== newIso) {
               schedule.nextRunAt = newIso;
               console.log(`[Scheduler] repaired nextRunAt schedule=${schedule.id} timezone=${APP_TIMEZONE} nextRunAt=${newIso}`);
               modified = true;
             }
          } else if (schedule.nextRunAt) {
             const delay = now - new Date(schedule.nextRunAt).getTime();
             if (delay > graceMs) {
                schedule.status = 'error';
                schedule.lastResult = {
                  totalTargets: schedule.targets.length,
                  sentCount: 0,
                  failedCount: schedule.targets.length,
                  skippedCount: schedule.targets.length,
                  executedAt: new Date().toISOString(),
                  details: schedule.targets.map((t) => ({
                    targetJid: t.jid,
                    targetLabel: t.label,
                    status: 'skipped',
                    error: 'Horário expirado durante reinicialização do servidor',
                  })),
                };
                schedule.nextRunAt = null;
                console.log(`[Scheduler] marked once schedule=${schedule.id} as error (expired)`);
                modified = true;
             }
          }
        }
      }
    }

    if (modified) {
      this.saveSchedules();
    }
  }

  /**
   * Single loop tick: identifies schedules that are active and due
   */
  private async processDueSchedules() {
    const now = Date.now();
    const graceMs = SCHEDULE_GRACE_MINUTES * 60 * 1000;

    for (const schedule of this.schedules) {
      if (schedule.status !== 'active' || !schedule.nextRunAt) {
        continue;
      }

      const dueTime = new Date(schedule.nextRunAt).getTime();
      if (isNaN(dueTime)) continue;

      if (dueTime <= now) {
        // Check if overdue beyond grace period
        const delay = now - dueTime;
        if (delay > graceMs) {
          console.log(
            `[Scheduler] skipping overdue schedule=${schedule.id} delay=${Math.round(
              delay / 60000
            )}m > grace=${SCHEDULE_GRACE_MINUTES}m`
          );
          if (schedule.scheduleType === 'once') {
            schedule.status = 'error';
            schedule.lastResult = {
              totalTargets: schedule.targets.length,
              sentCount: 0,
              failedCount: schedule.targets.length,
              skippedCount: schedule.targets.length,
              executedAt: new Date().toISOString(),
              details: schedule.targets.map((t) => ({
                targetJid: t.jid,
                targetLabel: t.label,
                status: 'skipped',
                error: 'Expirado fora da tolerância',
              })),
            };
          } else {
            schedule.nextRunAt = this.calculateNextRunAt(schedule, new Date(now));
          }
          this.saveSchedules();
          this.emitUpdated();
          continue;
        }

        // Execute due schedule
        await this.executeSchedule(schedule, false);
      }
    }
  }

  /**
   * Triggers immediate execution of a schedule (Run Now)
   */
  public async runNow(
    id: string, instanceId: string
  ): Promise<{ success: boolean; result?: ScheduleLastResult; error?: string }> {
    const schedule = this.schedules.find((s) => s.id === id && s.instanceId === instanceId);
    if (!schedule) {
      return { success: false, error: 'Agendamento não encontrado.' };
    }

    if (this.processingSchedules.has(schedule.id)) {
      return {
        success: false,
        error: 'Este agendamento já está em execução no momento.',
      };
    }

    const instance = this.instanceManager.get(schedule.instanceId);
    if (!instance || !instance.whatsapp) {
      return { success: false, error: 'Instância não encontrada ou WhatsApp indisponível.' };
    }
    const state = instance.whatsapp.getState();
    if (state.status !== 'connected') {
      return {
        success: false,
        error: 'WhatsApp não está conectado. Conecte antes de disparar o agendamento.',
      };
    }

    if (!schedule.targets || schedule.targets.length === 0) {
      return {
        success: false,
        error: 'Nenhum destinatário configurado neste agendamento.',
      };
    }

    const result = await this.executeSchedule(schedule, true);
    return { success: true, result };
  }

  /**
   * Core sequential queue execution engine with throttle, retries, and result tracking
   */
  private async executeSchedule(
    schedule: ScheduledMessage,
    isRunNow = false
  ): Promise<ScheduleLastResult> {
    if (this.processingSchedules.has(schedule.id)) {
      console.log(`[Scheduler] schedule=${schedule.id} is already running, skipping`);
      return (
        schedule.lastResult || {
          totalTargets: schedule.targets.length,
          sentCount: 0,
          failedCount: 0,
          skippedCount: schedule.targets.length,
          executedAt: new Date().toISOString(),
          details: [],
        }
      );
    }

    this.processingSchedules.add(schedule.id);
    schedule.status = 'running';
    this.saveSchedules();
    this.emitUpdated();

    if (this.io) {
      this.io.to(`instance:${schedule.instanceId}`).emit('scheduler:started', {
        scheduleId: schedule.id,
        instanceId: schedule.instanceId,
        name: schedule.name,
        targetsCount: schedule.targets.length,
        isRunNow,
      });
    }

    console.log(
      `[Scheduler] executing schedule=${schedule.id} targets=${schedule.targets.length} hasMedia=${Boolean(
        schedule.media
      )}`
    );

    const executionSeed = `${schedule.id}_${Date.now()}`;
    const details: ScheduleExecutionDetail[] = [];
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    const intervalMs = Math.max(
      1000,
      schedule.deliveryOptions?.intervalBetweenMessagesMs ?? MIN_SEND_INTERVAL_MS
    );
    const batchPauseEnabled = Boolean(schedule.deliveryOptions?.batchPauseEnabled);
    const batchSize = Math.max(1, schedule.deliveryOptions?.batchSize || 5);
    const batchPauseMs = Math.max(5000, schedule.deliveryOptions?.batchPauseMs || 300000);

    for (let i = 0; i < schedule.targets.length; i++) {
      // Safety check: verify schedule has not been paused or cancelled
      const currentSchedule = this.schedules.find((s) => s.id === schedule.id);
      if (
        !currentSchedule ||
        currentSchedule.status === 'paused' ||
        !this.processingSchedules.has(schedule.id)
      ) {
        console.log(`[Scheduler] execution interrupted for schedule=${schedule.id}`);
        break;
      }

      const target = schedule.targets[i];

      console.log(
        `[Scheduler] sending target=${target.label || target.jid} (${i + 1}/${
          schedule.targets.length
        })`
      );

      // Personalize message with template renderer
      const renderedMessage = renderMessageTemplate(
        schedule.message || '',
        target,
        schedule.fallbackName || 'amigo(a)',
        { seed: executionSeed }
      );

      // Emit progress
      const progressEvent: SchedulerProgressEvent = {
        scheduleId: schedule.id,
        instanceId: schedule.instanceId,
        scheduleName: schedule.name,
        currentIndex: i + 1,
        totalTargets: schedule.targets.length,
        targetLabel: target.label,
        targetJid: target.jid,
        status: 'sending',
        phase: 'sending',
        sentCount,
        failedCount,
      };
      if (this.io) {
        this.io.to(`instance:${schedule.instanceId}`).emit('scheduler:progress', progressEvent);
      }

      // Check WhatsApp connection
      const instance = this.instanceManager.get(schedule.instanceId);
      if (!instance || !instance.whatsapp) {
        console.log(`[Scheduler] WhatsApp not found for instance=${schedule.instanceId}`);
        failedCount++;
        details.push({
          targetJid: target.jid,
          targetLabel: target.label,
          status: 'failed',
          renderedPreview: renderedMessage,
          error: 'Instância desconectada/inexistente',
        });
        continue;
      }
      const state = instance.whatsapp.getState();
      if (state.status !== 'connected') {
        console.log(
          `[Scheduler] WhatsApp disconnected during schedule=${schedule.id} target=${target.label}`
        );
        failedCount++;
        details.push({
          targetJid: target.jid,
          targetLabel: target.label,
          status: 'failed',
          renderedPreview: renderedMessage,
          error: 'WhatsApp desconectado',
        });
        continue;
      }

      // Attempt send with retry and small backoff
      let attemptSuccess = false;
      let lastError = '';
      let messageId: string | undefined;

      for (let attempt = 1; attempt <= MAX_SEND_RETRIES; attempt++) {
        try {
          if (schedule.media && schedule.media.type === 'image') {
            const sendRes = await instance.whatsapp.sendImageMessage(
              target.jid,
              schedule.media,
              renderedMessage
            );
            if (sendRes.success) {
              attemptSuccess = true;
              messageId = sendRes.message?.id;
              break;
            } else {
              lastError = sendRes.error || 'Falha no envio da imagem';
            }
          } else {
            const sendRes = await instance.whatsapp.sendTextMessage(target.jid, renderedMessage);
            if (sendRes.success) {
              attemptSuccess = true;
              messageId = sendRes.message?.id;
              break;
            } else {
              lastError = sendRes.error || 'Falha no envio da mensagem';
            }
          }
        } catch (err: any) {
          lastError = err?.message || 'Erro inesperado';
        }

        if (attempt < MAX_SEND_RETRIES) {
          // Linear backoff
          await new Promise((res) => setTimeout(res, 1000 * attempt));
        }
      }

      if (attemptSuccess) {
        sentCount++;
        console.log(
          `[Scheduler] sent target=${target.label || target.jid} id=${messageId || 'unknown'}`
        );
        details.push({
          targetJid: target.jid,
          targetLabel: target.label,
          status: 'sent',
          messageId,
          renderedPreview: renderedMessage,
          sentAt: new Date().toISOString(),
        });
      } else {
        failedCount++;
        console.log(
          `[Scheduler] failed target=${target.label || target.jid} error=${lastError}`
        );
        details.push({
          targetJid: target.jid,
          targetLabel: target.label,
          status: 'failed',
          renderedPreview: renderedMessage,
          error: lastError,
        });
      }

      // Update progress with completion of current target
      if (this.io) {
        this.io.to(`instance:${schedule.instanceId}`).emit('scheduler:progress', {
          ...progressEvent,
          status: attemptSuccess ? 'sent' : 'failed',
          phase: 'sending',
          sentCount,
          failedCount,
        });
      }

      // Throttle or Batch Pause before next target
      if (i < schedule.targets.length - 1) {
        const itemsProcessed = i + 1;
        const isBatchBoundary = itemsProcessed % batchSize === 0;

        if (batchPauseEnabled && isBatchBoundary) {
          const pauseUntil = Date.now() + batchPauseMs;
          const resumeAt = new Date(pauseUntil).toISOString();
          console.log(
            `[Scheduler] batch pause of ${Math.round(batchPauseMs / 1000)}s after ${itemsProcessed} items for schedule=${schedule.id}`
          );

          if (this.io) {
            this.io.to(`instance:${schedule.instanceId}`).emit('scheduler:progress', {
              scheduleId: schedule.id,
        instanceId: schedule.instanceId,
              scheduleName: schedule.name,
              currentIndex: itemsProcessed,
              totalTargets: schedule.targets.length,
              targetLabel: target.label,
              targetJid: target.jid,
              status: 'batch_pause',
              phase: 'batch_pause',
              resumeAt,
              sentCount,
              failedCount,
            });
          }

          // Loop until batch pause duration passes or schedule is paused/cancelled
          while (Date.now() < pauseUntil) {
            const currentCheck = this.schedules.find((s) => s.id === schedule.id);
            if (
              !currentCheck ||
              currentCheck.status === 'paused' ||
              !this.processingSchedules.has(schedule.id)
            ) {
              console.log(
                `[Scheduler] cancelled during batch pause for schedule=${schedule.id}`
              );
              break;
            }
            const sleepTime = Math.min(1000, pauseUntil - Date.now());
            if (sleepTime > 0) {
              await new Promise((r) => setTimeout(r, sleepTime));
            }
          }
        } else {
          // Standard interval between individual messages
          await new Promise((res) => setTimeout(res, intervalMs));
        }
      }
    }

    const executionResult: ScheduleLastResult = {
      totalTargets: schedule.targets.length,
      sentCount,
      failedCount,
      skippedCount,
      executedAt: new Date().toISOString(),
      details,
    };

    console.log(
      `[Scheduler] completed schedule=${schedule.id} sent=${sentCount} failed=${failedCount}`
    );

    // Update schedule state
    schedule.lastRunAt = new Date().toISOString();
    schedule.lastResult = executionResult;

    if (schedule.scheduleType === 'once') {
      schedule.status = failedCount > 0 && sentCount === 0 ? 'error' : 'completed';
      schedule.nextRunAt = null;
    } else {
      // Recurring schedule: calculate next run time from current time (preserving recurrence after run now)
      schedule.status = 'active';
      schedule.nextRunAt = this.calculateNextRunAt(schedule);
    }

    this.processingSchedules.delete(schedule.id);
    this.saveSchedules();
    this.emitUpdated();

    if (this.io) {
      this.io.to(`instance:${schedule.instanceId}`).emit('scheduler:completed', {
        scheduleId: schedule.id,
        instanceId: schedule.instanceId,
        name: schedule.name,
        result: executionResult,
      });
    }

    return executionResult;
  }
}



