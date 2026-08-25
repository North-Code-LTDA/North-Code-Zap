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
      if (c.media.size !== undefined && (!Number.isInteger(c.media.size) || c.media.size < 0)) throw new Error('Invalid media size');
    }

    if (!c.schedule || typeof c.schedule !== 'object') throw new Error('Invalid schedule');
    
    if (!['once', 'daily', 'weekly'].includes(c.schedule.scheduleType)) throw new Error('Invalid scheduleType');
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
    
    if (!c.schedule.deliveryOptions || typeof c.schedule.deliveryOptions !== 'object') throw new Error('Invalid deliveryOptions');
    if (typeof c.schedule.deliveryOptions.intervalBetweenMessagesMs !== 'number' || !Number.isFinite(c.schedule.deliveryOptions.intervalBetweenMessagesMs) || c.schedule.deliveryOptions.intervalBetweenMessagesMs < 0) throw new Error('Invalid intervalBetweenMessagesMs');
    if (typeof c.schedule.deliveryOptions.batchPauseEnabled !== 'boolean') throw new Error('Invalid batchPauseEnabled');
    if (!Number.isInteger(c.schedule.deliveryOptions.batchSize) || c.schedule.deliveryOptions.batchSize <= 0) throw new Error('Invalid batchSize');
    if (typeof c.schedule.deliveryOptions.batchPauseMs !== 'number' || !Number.isFinite(c.schedule.deliveryOptions.batchPauseMs) || c.schedule.deliveryOptions.batchPauseMs < 0) throw new Error('Invalid batchPauseMs');

    if (c.scheduleId !== null && (typeof c.scheduleId !== 'string' || !this.isValidUuid(c.scheduleId))) throw new Error('Invalid scheduleId');
    
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
