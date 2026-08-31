import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from './instances.js';
import type { Campaign, CampaignScheduleConfig, CampaignAudienceSnapshot } from '../src/types';

const CAMPAIGNS_DIR = path.join(DATA_DIR, 'campaigns');
const CAMPAIGNS_FILE = path.join(CAMPAIGNS_DIR, 'campaigns.json');

export class CampaignService {
  private state: Campaign[] = [];

  constructor() {
    this.ensureDirectory();
  }

  public init() {
    this.load();
  }

  private ensureDirectory() {
    if (!fs.existsSync(CAMPAIGNS_DIR)) {
      fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });
    }
  }

  private load() {
    if (!fs.existsSync(CAMPAIGNS_FILE)) {
      this.state = [];
      return;
    }
    const content = fs.readFileSync(CAMPAIGNS_FILE, 'utf-8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error('Invalid campaigns file format');
    }

    for (const c of parsed) {
      if (c && c.schedule) {
         c.schedule.monthlyTimeSlots = c.schedule.monthlyTimeSlots ?? [];
         c.schedule.specificDateTimeSlots = c.schedule.specificDateTimeSlots ?? [];
      }
      this.validateCampaign(c);
    }
    
    const ids = new Set<string>();
    const scheduleIds = new Set<string>();
    for (const c of parsed) {
      if (ids.has(c.id)) throw new Error(`Duplicate campaign id: ${c.id}`);
      ids.add(c.id);
      if (c.scheduleId !== null) {
        if (scheduleIds.has(c.scheduleId)) throw new Error(`Duplicate scheduleId: ${c.scheduleId}`);
        scheduleIds.add(c.scheduleId);
      }
    }

    this.state = parsed;
    console.log(`[Campaigns] loaded campaigns=${this.state.length}`);
  }


  private isValidSchedulerId(value: string): boolean {
    return /^sched_\d+_[a-z0-9]+$/i.test(value);
  }

  private isValidUuid(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  private isValidTime(str: string): boolean {
    const match = str.match(/^(\d{2}):(\d{2})$/);
    if (!match) return false;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }

  private validateCampaign(c: any) {

    if (!c || typeof c !== 'object') throw new Error('Invalid campaign object');
    
    if (typeof c.id !== 'string' || !this.isValidUuid(c.id)) throw new Error('Invalid campaign id');
    if (typeof c.workspaceId !== 'string' || !this.isValidUuid(c.workspaceId)) throw new Error('Invalid workspaceId');
    if (typeof c.instanceId !== 'string' || !this.isValidUuid(c.instanceId)) throw new Error('Invalid instanceId');
    
    if (typeof c.name !== 'string' || c.name.trim().length === 0 || c.name.trim().length > 120) throw new Error('Invalid name');
    
    if (c.audienceListId !== null && (typeof c.audienceListId !== 'string' || !this.isValidUuid(c.audienceListId))) throw new Error('Invalid audienceListId');
    
    if (c.audienceSnapshot !== null) {
      if (typeof c.audienceSnapshot !== 'object') throw new Error('Invalid audienceSnapshot');
      if (typeof c.audienceSnapshot.listId !== 'string' || !this.isValidUuid(c.audienceSnapshot.listId)) throw new Error('Invalid audienceSnapshot.listId');
      if (typeof c.audienceSnapshot.listName !== 'string' || c.audienceSnapshot.listName.trim().length === 0 || c.audienceSnapshot.listName.trim().length > 100) throw new Error('Invalid audienceSnapshot.listName');
      if (!Number.isInteger(c.audienceSnapshot.targetCount) || c.audienceSnapshot.targetCount < 0) throw new Error('Invalid audienceSnapshot.targetCount');
    }

    if (typeof c.message !== 'string') throw new Error('Invalid message');
    if (typeof c.fallbackName !== 'string') throw new Error('Invalid fallbackName');
    
    if (c.media !== null) {
      if (typeof c.media !== 'object') throw new Error('Invalid media');
      if (c.media.type !== 'image') throw new Error('Invalid media type');
      if (c.media.source !== 'upload' && c.media.source !== 'url') throw new Error('Invalid media source');
      
      if (c.media.source === 'upload') {
        if (typeof c.media.localPath !== 'string' || c.media.localPath.trim().length === 0) throw new Error('Invalid media localPath');
      } else {
        if (typeof c.media.url !== 'string' || c.media.url.trim().length === 0) throw new Error('Invalid media url');
      }
      
      if (c.media.url !== undefined && typeof c.media.url !== 'string') throw new Error('Invalid media url type');
      if (c.media.localPath !== undefined && typeof c.media.localPath !== 'string') throw new Error('Invalid media localPath type');
      if (c.media.fileName !== undefined && typeof c.media.fileName !== 'string') throw new Error('Invalid media fileName type');
      if (c.media.mimeType !== undefined && typeof c.media.mimeType !== 'string') throw new Error('Invalid media mimeType type');
      if (c.media.size !== undefined && (!Number.isInteger(c.media.size) || c.media.size < 0)) throw new Error('Invalid media size');
    }

    if (!c.schedule || typeof c.schedule !== 'object') throw new Error('Invalid schedule');
    
    if (!['once', 'daily', 'weekly', 'monthly', 'specific_dates'].includes(c.schedule.scheduleType)) throw new Error('Invalid scheduleType');
    
    // Legacy normalization for missing arrays (before checking)
    if (!('monthlyTimeSlots' in c.schedule)) c.schedule.monthlyTimeSlots = [];
    if (!('specificDateTimeSlots' in c.schedule)) c.schedule.specificDateTimeSlots = [];

    const sch = c.schedule;
    if (sch.scheduleType === 'once') {
      if (sch.dailyTimes.length > 0 || sch.weeklyTimeSlots.length > 0 || sch.monthlyTimeSlots.length > 0 || sch.specificDateTimeSlots.length > 0) throw new Error('once inválido');
    } else if (sch.scheduleType === 'daily') {
      if (sch.scheduledAt !== null || sch.dailyTimes.length === 0 || sch.weeklyTimeSlots.length > 0 || sch.monthlyTimeSlots.length > 0 || sch.specificDateTimeSlots.length > 0) throw new Error('daily inválido');
    } else if (sch.scheduleType === 'weekly') {
      if (sch.scheduledAt !== null || sch.dailyTimes.length > 0 || sch.weeklyTimeSlots.length === 0 || sch.monthlyTimeSlots.length > 0 || sch.specificDateTimeSlots.length > 0) throw new Error('weekly inválido');
    } else if (sch.scheduleType === 'monthly') {
      if (sch.scheduledAt !== null || sch.dailyTimes.length > 0 || sch.weeklyTimeSlots.length > 0 || sch.monthlyTimeSlots.length === 0 || sch.specificDateTimeSlots.length > 0) throw new Error('monthly inválido');
    } else if (sch.scheduleType === 'specific_dates') {
      if (sch.scheduledAt !== null || sch.dailyTimes.length > 0 || sch.weeklyTimeSlots.length > 0 || sch.monthlyTimeSlots.length > 0 || sch.specificDateTimeSlots.length === 0) throw new Error('specific_dates inválido');
    }
    if (c.schedule.scheduledAt !== null && (typeof c.schedule.scheduledAt !== 'string' || isNaN(Date.parse(c.schedule.scheduledAt)))) throw new Error('Invalid scheduledAt');
    
    if (!Array.isArray(c.schedule.dailyTimes)) throw new Error('Invalid dailyTimes array');
    const seenTimes = new Set<string>();
    for (const t of c.schedule.dailyTimes) {
      if (typeof t !== 'string' || !this.isValidTime(t)) throw new Error('Invalid time in dailyTimes');
      if (seenTimes.has(t)) throw new Error('Duplicate time in dailyTimes');
      seenTimes.add(t);
    }
    
    if (!Array.isArray(c.schedule.weeklyTimeSlots)) throw new Error('Invalid weeklyTimeSlots array');
    const seenDays = new Set<number>();
    for (const slot of c.schedule.weeklyTimeSlots) {
      if (!slot || typeof slot !== 'object') throw new Error('Invalid weeklyTimeSlot element');
      if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) throw new Error('Invalid day in weeklyTimeSlots');
      if (seenDays.has(slot.day)) throw new Error('Duplicate day in weeklyTimeSlots');
      seenDays.add(slot.day);
      
      if (!Array.isArray(slot.times)) throw new Error('Invalid times in weeklyTimeSlots');
      const seenSlotTimes = new Set<string>();
      for (const t of slot.times) {
        if (typeof t !== 'string' || !this.isValidTime(t)) throw new Error('Invalid time in weeklyTimeSlot');
        if (seenSlotTimes.has(t)) throw new Error('Duplicate time in weeklyTimeSlot');
        seenSlotTimes.add(t);
      }
    }
    

    if (!Array.isArray(c.schedule.monthlyTimeSlots)) throw new Error('Invalid monthlyTimeSlots array');
    const seenMonthlyDays = new Set<number>();
    for (const slot of c.schedule.monthlyTimeSlots) {
      if (!slot || typeof slot !== 'object') throw new Error('Invalid monthlyTimeSlot element');
      if (!Number.isInteger(slot.day) || slot.day < 1 || slot.day > 31) throw new Error('Invalid day in monthlyTimeSlots');
      if (seenMonthlyDays.has(slot.day)) throw new Error('Duplicate day in monthlyTimeSlots');
      seenMonthlyDays.add(slot.day);
      if (!Array.isArray(slot.times) || slot.times.length === 0) throw new Error('Invalid times in monthlyTimeSlots');
      const seenMTime = new Set<string>();
      for (const t of slot.times) {
        if (typeof t !== 'string' || !this.isValidTime(t)) throw new Error('Invalid time in monthlyTimeSlot');
        if (seenMTime.has(t)) throw new Error('Duplicate time in monthlyTimeSlot');
        seenMTime.add(t);
      }
    }

    if (!Array.isArray(c.schedule.specificDateTimeSlots)) throw new Error('Invalid specificDateTimeSlots array');
    const seenDates = new Set<string>();
    for (const slot of c.schedule.specificDateTimeSlots) {
      if (!slot || typeof slot !== 'object') throw new Error('Invalid specificDateTimeSlot element');
      if (typeof slot.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(slot.date)) throw new Error('Invalid date in specificDateTimeSlots');
      const [vy, vm, vd] = slot.date.split('-').map(Number);
      const vdt = new Date(vy, vm - 1, vd);
      if (vdt.getFullYear() !== vy || vdt.getMonth() !== vm - 1 || vdt.getDate() !== vd) throw new Error('Invalid real date in specificDateTimeSlots');
      if (seenDates.has(slot.date)) throw new Error('Duplicate date in specificDateTimeSlots');
      seenDates.add(slot.date);
      if (!Array.isArray(slot.times) || slot.times.length === 0) throw new Error('Invalid times in specificDateTimeSlots');
      const seenDTime = new Set<string>();
      for (const t of slot.times) {
        if (typeof t !== 'string' || !this.isValidTime(t)) throw new Error('Invalid time in specificDateTimeSlot');
        if (seenDTime.has(t)) throw new Error('Duplicate time in specificDateTimeSlot');
        seenDTime.add(t);
      }
    }
    if (!c.schedule.deliveryOptions || typeof c.schedule.deliveryOptions !== 'object') throw new Error('Invalid deliveryOptions');
    
    // Legacy normalization
    const dOpt = c.schedule.deliveryOptions;
    if (
      dOpt.intervalBetweenMessagesMinMs === undefined &&
      dOpt.intervalBetweenMessagesMaxMs === undefined &&
      dOpt.intervalBetweenMessagesMs !== undefined
    ) {
      if (typeof dOpt.intervalBetweenMessagesMs === 'number' && Number.isFinite(dOpt.intervalBetweenMessagesMs)) {
        const canonicalLegacyInterval = Math.max(1000, dOpt.intervalBetweenMessagesMs);
        dOpt.intervalBetweenMessagesMinMs = canonicalLegacyInterval;
        dOpt.intervalBetweenMessagesMaxMs = canonicalLegacyInterval;
        delete dOpt.intervalBetweenMessagesMs;
      } else {
        throw new Error('Invalid legacy intervalBetweenMessagesMs');
      }
    } else if (
      (dOpt.intervalBetweenMessagesMinMs !== undefined && dOpt.intervalBetweenMessagesMaxMs === undefined) ||
      (dOpt.intervalBetweenMessagesMaxMs !== undefined && dOpt.intervalBetweenMessagesMinMs === undefined) ||
      (dOpt.intervalBetweenMessagesMinMs !== undefined && dOpt.intervalBetweenMessagesMaxMs !== undefined && dOpt.intervalBetweenMessagesMs !== undefined)
    ) {
      throw new Error('Ambiguous interval range');
    }

    if (!Number.isInteger(c.schedule.deliveryOptions.intervalBetweenMessagesMinMs) || c.schedule.deliveryOptions.intervalBetweenMessagesMinMs < 1000) throw new Error('Invalid intervalBetweenMessagesMinMs');
    if (!Number.isInteger(c.schedule.deliveryOptions.intervalBetweenMessagesMaxMs) || c.schedule.deliveryOptions.intervalBetweenMessagesMaxMs < 1000) throw new Error('Invalid intervalBetweenMessagesMaxMs');
    if (c.schedule.deliveryOptions.intervalBetweenMessagesMaxMs < c.schedule.deliveryOptions.intervalBetweenMessagesMinMs) throw new Error('intervalBetweenMessagesMaxMs must be >= MinMs');
    
    if (typeof c.schedule.deliveryOptions.batchPauseEnabled !== 'boolean') throw new Error('Invalid batchPauseEnabled');
    if (!Number.isInteger(c.schedule.deliveryOptions.batchSize) || c.schedule.deliveryOptions.batchSize <= 0) throw new Error('Invalid batchSize');
    if (typeof c.schedule.deliveryOptions.batchPauseMs !== 'number' || !Number.isFinite(c.schedule.deliveryOptions.batchPauseMs) || c.schedule.deliveryOptions.batchPauseMs < 0) throw new Error('Invalid batchPauseMs');

    if (c.scheduleId !== null && (typeof c.scheduleId !== 'string' || !this.isValidSchedulerId(c.scheduleId))) throw new Error('Invalid scheduleId');
    
    if (c.scheduleId === null && c.audienceSnapshot !== null) throw new Error('audienceSnapshot must be null when scheduleId is null');
    if (c.scheduleId !== null && c.audienceSnapshot === null) throw new Error('audienceSnapshot must exist when scheduleId is not null');

    if (typeof c.createdAt !== 'string' || isNaN(Date.parse(c.createdAt))) throw new Error('Invalid createdAt');
    if (typeof c.updatedAt !== 'string' || isNaN(Date.parse(c.updatedAt))) throw new Error('Invalid updatedAt');
  }

  private persist(nextState: Campaign[]) {
    const tmp = `${CAMPAIGNS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(nextState, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, CAMPAIGNS_FILE);
    this.state = nextState;
  }

  public getAll(): Campaign[] {
    return this.state;
  }

  public listForWorkspace(workspaceId: string): Campaign[] {
    return this.state.filter(c => c.workspaceId === workspaceId);
  }
  
  public getForWorkspace(id: string, workspaceId: string): Campaign | undefined {
    return this.state.find(c => c.id === id && c.workspaceId === workspaceId);
  }

  public getByScheduleId(scheduleId: string): Campaign | undefined {
    return this.state.find(c => c.scheduleId === scheduleId);
  }

  public getByScheduleIdForWorkspace(scheduleId: string, workspaceId: string): Campaign | undefined {
    return this.state.find(c => c.scheduleId === scheduleId && c.workspaceId === workspaceId);
  }

  public createDraft(data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'scheduleId' | 'audienceSnapshot'>): Campaign {
    const nextState = structuredClone(this.state);
    
    const newCampaign: Campaign = {
      ...data,
      id: crypto.randomUUID(),
      scheduleId: null,
      audienceSnapshot: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    this.validateCampaign(newCampaign);
    nextState.push(newCampaign);
    this.persist(nextState);
    return newCampaign;
  }

  public updateDraft(id: string, workspaceId: string, updates: Partial<Campaign>): Campaign {
    const nextState = structuredClone(this.state);
    const index = nextState.findIndex((c: Campaign) => c.id === id && c.workspaceId === workspaceId);
    if (index === -1) throw new Error('Campaign not found');
    
    const campaign = nextState[index];
    if (campaign.scheduleId !== null) {
      throw new Error('Campanha programada deve voltar para rascunho antes de ser editada.');
    }

    if (updates.name !== undefined) campaign.name = updates.name.trim();
    if (updates.audienceListId !== undefined) campaign.audienceListId = updates.audienceListId;
    if (updates.message !== undefined) campaign.message = updates.message;
    if (updates.fallbackName !== undefined) campaign.fallbackName = updates.fallbackName;
    if (updates.media !== undefined) campaign.media = updates.media;
    if (updates.schedule !== undefined) campaign.schedule = updates.schedule as any;

    campaign.updatedAt = new Date().toISOString();
    
    this.validateCampaign(campaign);
    this.persist(nextState);
    return campaign;
  }

  public attachSchedule(id: string, workspaceId: string, scheduleId: string, audienceSnapshot: CampaignAudienceSnapshot): Campaign {
    const nextState = structuredClone(this.state);
    const index = nextState.findIndex((c: Campaign) => c.id === id && c.workspaceId === workspaceId);
    if (index === -1) throw new Error('Campaign not found');
    
    const campaign = nextState[index];
    if (campaign.scheduleId !== null) {
       throw new Error('Campanha já possui um agendamento vinculado.');
    }

    campaign.scheduleId = scheduleId;
    campaign.audienceSnapshot = audienceSnapshot;
    campaign.updatedAt = new Date().toISOString();
    
    this.validateCampaign(campaign);
    this.persist(nextState);
    return campaign;
  }

  public clearSchedule(id: string, workspaceId: string): Campaign {
    const nextState = structuredClone(this.state);
    const index = nextState.findIndex((c: Campaign) => c.id === id && c.workspaceId === workspaceId);
    if (index === -1) throw new Error('Campaign not found');
    
    const campaign = nextState[index];
    campaign.scheduleId = null;
    campaign.audienceSnapshot = null;
    campaign.updatedAt = new Date().toISOString();
    
    this.validateCampaign(campaign);
    this.persist(nextState);
    return campaign;
  }

  public deleteCampaign(id: string, workspaceId: string) {
    const nextState = structuredClone(this.state);
    const index = nextState.findIndex((c: Campaign) => c.id === id && c.workspaceId === workspaceId);
    if (index === -1) throw new Error('Campaign not found');
    
    nextState.splice(index, 1);
    this.persist(nextState);
  }
}

export const campaignService = new CampaignService();
