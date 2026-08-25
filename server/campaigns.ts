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

  private validateCampaign(c: any) {
    if (!c || typeof c !== 'object') throw new Error('Invalid campaign object');
    if (typeof c.id !== 'string') throw new Error('Invalid campaign id');
    if (typeof c.workspaceId !== 'string') throw new Error('Invalid workspaceId');
    if (typeof c.instanceId !== 'string') throw new Error('Invalid instanceId');
    if (typeof c.name !== 'string' || c.name.trim().length === 0 || c.name.length > 120) throw new Error('Invalid name');
    
    if (c.audienceListId !== null && typeof c.audienceListId !== 'string') throw new Error('Invalid audienceListId');
    
    if (c.audienceSnapshot !== null) {
      if (typeof c.audienceSnapshot !== 'object') throw new Error('Invalid audienceSnapshot');
      if (typeof c.audienceSnapshot.listId !== 'string') throw new Error('Invalid audienceSnapshot.listId');
      if (typeof c.audienceSnapshot.listName !== 'string' || c.audienceSnapshot.listName.length === 0 || c.audienceSnapshot.listName.length > 100) throw new Error('Invalid audienceSnapshot.listName');
      if (!Number.isInteger(c.audienceSnapshot.targetCount) || c.audienceSnapshot.targetCount < 0) throw new Error('Invalid audienceSnapshot.targetCount');
    }

    if (typeof c.message !== 'string') throw new Error('Invalid message');
    if (typeof c.fallbackName !== 'string') throw new Error('Invalid fallbackName');
    
    if (c.media !== null) {
      if (typeof c.media !== 'object') throw new Error('Invalid media');
    }

    if (!c.schedule || typeof c.schedule !== 'object') throw new Error('Invalid schedule');

    if (c.scheduleId !== null && typeof c.scheduleId !== 'string') throw new Error('Invalid scheduleId');
    
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
