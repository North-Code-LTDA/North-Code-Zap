import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { CampaignExecutionHistory, CampaignExecutionSummary, ScheduleExecutionDetail } from '../src/types';
import { DATA_DIR } from './instances';

const HISTORY_DIR = path.join(DATA_DIR, 'history');
const HISTORY_FILE = path.join(HISTORY_DIR, 'executions.json');

function isValidUuid(id: any): boolean {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isValidDate(dateStr: any): boolean {
  if (typeof dateStr !== 'string') return false;
  return !isNaN(Date.parse(dateStr));
}

function validateExecutionHistory(record: any) {
  if (!isValidUuid(record.id)) throw new Error(`Invalid id: ${record.id}`);
  if (!isValidUuid(record.workspaceId)) throw new Error(`Invalid workspaceId: ${record.workspaceId}`);
  if (!isValidUuid(record.instanceId)) throw new Error(`Invalid instanceId: ${record.instanceId}`);
  if (!isValidUuid(record.campaignId)) throw new Error(`Invalid campaignId: ${record.campaignId}`);

  if (typeof record.scheduleId !== 'string' || record.scheduleId.trim().length === 0) {
    throw new Error('Invalid scheduleId');
  }
  if (typeof record.scheduleName !== 'string' || record.scheduleName.trim().length === 0) {
    throw new Error('Invalid scheduleName');
  }

  if (!isValidDate(record.executedAt)) {
    throw new Error('Invalid executedAt');
  }

  if (!Number.isInteger(record.totalTargets) || record.totalTargets < 0) throw new Error('Invalid totalTargets');
  if (!Number.isInteger(record.sentCount) || record.sentCount < 0) throw new Error('Invalid sentCount');
  if (!Number.isInteger(record.failedCount) || record.failedCount < 0) throw new Error('Invalid failedCount');
  if (!Number.isInteger(record.skippedCount) || record.skippedCount < 0) throw new Error('Invalid skippedCount');

  if (!Array.isArray(record.details)) {
    throw new Error('details must be an array');
  }

  for (const d of record.details) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      throw new Error('detail item must be an object');
    }
    if (typeof d.targetJid !== 'string' || d.targetJid.trim().length === 0) throw new Error('Invalid targetJid');
    if (typeof d.targetLabel !== 'string' || d.targetLabel.trim().length === 0) throw new Error('Invalid targetLabel');
    if (d.status !== 'sent' && d.status !== 'failed' && d.status !== 'skipped') {
      throw new Error('Invalid status');
    }
    
    if (d.messageId !== undefined && typeof d.messageId !== 'string') throw new Error('Invalid messageId');
    if (d.sentAt !== undefined && !isValidDate(d.sentAt)) throw new Error('Invalid sentAt');
    if (d.renderedPreview !== undefined && typeof d.renderedPreview !== 'string') throw new Error('Invalid renderedPreview');
    if (d.error !== undefined && typeof d.error !== 'string') throw new Error('Invalid error');
  }
}

export class CampaignHistoryService {
  private state: CampaignExecutionHistory[] = [];

  public init() {
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }

    if (!fs.existsSync(HISTORY_FILE)) {
      this.state = [];
      return;
    }

    const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error('CampaignHistory root is not an array');
    }

    const ids = new Set<string>();
    const executions = new Set<string>();

    for (const record of parsed) {
      validateExecutionHistory(record);

      if (ids.has(record.id)) {
        throw new Error(`Duplicate CampaignHistory ID: ${record.id}`);
      }
      ids.add(record.id);

      const execKey = `${record.scheduleId}_${record.executedAt}`;
      if (executions.has(execKey)) {
        throw new Error(`Duplicate execution: ${execKey}`);
      }
      executions.add(execKey);
    }

    this.state = parsed;
  }

  private persist(newState: CampaignExecutionHistory[]) {
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
    const tmp = `${HISTORY_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(newState, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, HISTORY_FILE);
    this.state = newState;
  }

  public recordExecution(params: Omit<CampaignExecutionHistory, 'id'>): CampaignExecutionHistory {
    const execKey = `${params.scheduleId}_${params.executedAt}`;
    
    // Idempotency check
    const existing = this.state.find(r => `${r.scheduleId}_${r.executedAt}` === execKey);
    if (existing) {
      return existing;
    }

    const newRecord: CampaignExecutionHistory = {
      id: randomUUID(),
      ...structuredClone(params)
    };

    validateExecutionHistory(newRecord);

    const nextState = structuredClone(this.state);
    nextState.push(newRecord);
    this.persist(nextState);

    return newRecord;
  }

  public listForCampaign(campaignId: string, workspaceId: string): CampaignExecutionSummary[] {
    const records = this.state.filter(r => r.campaignId === campaignId && r.workspaceId === workspaceId);
    
    // Sort executedAt DESC
    records.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());

    return records.map(r => ({
      id: r.id,
      campaignId: r.campaignId,
      scheduleId: r.scheduleId,
      scheduleName: r.scheduleName,
      executedAt: r.executedAt,
      totalTargets: r.totalTargets,
      sentCount: r.sentCount,
      failedCount: r.failedCount,
      skippedCount: r.skippedCount
    }));
  }

  public getForCampaign(executionId: string, campaignId: string, workspaceId: string): CampaignExecutionHistory | undefined {
    return this.state.find(r => r.id === executionId && r.campaignId === campaignId && r.workspaceId === workspaceId);
  }
}

export const campaignHistoryService = new CampaignHistoryService();
