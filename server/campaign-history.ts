import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { CampaignExecutionHistory, CampaignExecutionSummary, ScheduleExecutionDetail } from '../src/types';

const HISTORY_FILE = path.join(process.cwd(), 'data', 'history', 'executions.json');

export class CampaignHistoryService {
  private state: CampaignExecutionHistory[] = [];

  public init() {
    const historyDir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
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
      if (!record.id || !record.workspaceId || !record.instanceId || !record.campaignId || !record.scheduleId || !record.scheduleName || !record.executedAt) {
        throw new Error(`Invalid CampaignHistory record: missing required fields`);
      }
      if (typeof record.totalTargets !== 'number' || record.totalTargets < 0 ||
          typeof record.sentCount !== 'number' || record.sentCount < 0 ||
          typeof record.failedCount !== 'number' || record.failedCount < 0 ||
          typeof record.skippedCount !== 'number' || record.skippedCount < 0) {
        throw new Error(`Invalid CampaignHistory record: invalid counts`);
      }
      if (!Array.isArray(record.details)) {
        throw new Error(`Invalid CampaignHistory record: details must be an array`);
      }

      for (const d of record.details) {
        if (!d.targetJid || !d.targetLabel || !['sent', 'failed', 'skipped'].includes(d.status)) {
          throw new Error(`Invalid detail in history record`);
        }
      }

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
      ...params
    };

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
