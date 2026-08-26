import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Automation, AutomationTrigger } from '../src/types';
import { DATA_DIR } from './instances';

const AUTOMATIONS_DIR = path.join(DATA_DIR, 'automations');
const AUTOMATIONS_FILE = path.join(AUTOMATIONS_DIR, 'automations.json');

function isValidUuid(id: any): boolean {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isValidDate(dateStr: any): boolean {
  if (typeof dateStr !== 'string') return false;
  return !isNaN(Date.parse(dateStr));
}

function isValidTrigger(trigger: any): trigger is AutomationTrigger {
  if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) return false;
  if (trigger.type === 'contact_added_to_list') {
    return isValidUuid(trigger.listId);
  }
  if (trigger.type === 'tag_added_to_contact') {
    return isValidUuid(trigger.tagId);
  }
  return false;
}

export class AutomationService {
  private state: Automation[] = [];

  public init() {
    if (!fs.existsSync(AUTOMATIONS_DIR)) {
      fs.mkdirSync(AUTOMATIONS_DIR, { recursive: true });
    }

    if (!fs.existsSync(AUTOMATIONS_FILE)) {
      this.state = [];
      return;
    }

    const fileContent = fs.readFileSync(AUTOMATIONS_FILE, 'utf-8');
    const parsed = JSON.parse(fileContent);

    if (!Array.isArray(parsed)) {
      throw new Error('Automations file root must be an array.');
    }

    const ids = new Set<string>();
    const namesByInstance = new Map<string, Set<string>>(); // instanceId -> Set of names (lowercase)

    for (const record of parsed) {
      if (!isValidUuid(record.id)) throw new Error('Invalid automation id');
      if (!isValidUuid(record.workspaceId)) throw new Error('Invalid workspaceId');
      if (!isValidUuid(record.instanceId)) throw new Error('Invalid instanceId');
      if (typeof record.name !== 'string' || record.name.trim() === '') throw new Error('Invalid name');
      if (typeof record.enabled !== 'boolean') throw new Error('Invalid enabled');
      if (typeof record.message !== 'string' || record.message.trim() === '') throw new Error('Invalid message');
      if (typeof record.fallbackName !== 'string' || record.fallbackName.trim() === '') throw new Error('Invalid fallbackName');
      if (!isValidDate(record.createdAt)) throw new Error('Invalid createdAt');
      if (!isValidDate(record.updatedAt)) throw new Error('Invalid updatedAt');
      if (!isValidTrigger(record.trigger)) throw new Error('Invalid trigger');

      if (ids.has(record.id)) throw new Error(`Duplicate automation id: ${record.id}`);
      ids.add(record.id);

      const nameLower = record.name.trim().toLowerCase();
      let instanceNames = namesByInstance.get(record.instanceId);
      if (!instanceNames) {
        instanceNames = new Set<string>();
        namesByInstance.set(record.instanceId, instanceNames);
      }
      if (instanceNames.has(nameLower)) throw new Error(`Duplicate name in instance: ${record.name}`);
      instanceNames.add(nameLower);
    }

    this.state = parsed;
  }

  private saveState(nextState: Automation[]) {
    const tmp = `${AUTOMATIONS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(nextState, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, AUTOMATIONS_FILE);
    this.state = nextState;
  }

  public listForInstance(workspaceId: string, instanceId: string): Automation[] {
    return this.state
      .filter(a => a.workspaceId === workspaceId && a.instanceId === instanceId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getForInstance(id: string, workspaceId: string, instanceId: string): Automation | undefined {
    return this.state.find(a => a.id === id && a.workspaceId === workspaceId && a.instanceId === instanceId);
  }

  public create(workspaceId: string, instanceId: string, data: { name: string; enabled?: boolean; trigger: AutomationTrigger; message: string; fallbackName?: string; }): Automation {
    const nameStr = (data.name || '').trim();
    if (!nameStr) throw new Error('Name is required');

    const messageStr = (data.message || '').trim();
    if (!messageStr) throw new Error('Message is required');

    if (!isValidTrigger(data.trigger)) throw new Error('Invalid trigger');

    const nameLower = nameStr.toLowerCase();
    const isDuplicateName = this.state.some(a => a.instanceId === instanceId && a.name.toLowerCase() === nameLower);
    if (isDuplicateName) {
      const err = new Error('Duplicate automation name');
      (err as any).status = 409;
      throw err;
    }

    const now = new Date().toISOString();
    const newAutomation: Automation = {
      id: randomUUID(),
      workspaceId,
      instanceId,
      name: nameStr,
      enabled: data.enabled !== false,
      trigger: data.trigger,
      message: messageStr,
      fallbackName: (data.fallbackName || 'amigo(a)').trim(),
      createdAt: now,
      updatedAt: now
    };

    if (!newAutomation.fallbackName) {
        newAutomation.fallbackName = 'amigo(a)';
    }

    const nextState = structuredClone(this.state);
    nextState.push(newAutomation);
    this.saveState(nextState);

    return newAutomation;
  }

  public update(id: string, workspaceId: string, instanceId: string, data: Partial<{ name: string; enabled: boolean; trigger: AutomationTrigger; message: string; fallbackName: string; }>): Automation {
    const nextState = structuredClone(this.state);
    const index = nextState.findIndex(a => a.id === id && a.workspaceId === workspaceId && a.instanceId === instanceId);
    
    if (index === -1) {
      const err = new Error('Automation not found');
      (err as any).status = 404;
      throw err;
    }

    const automation = nextState[index];

    if (data.name !== undefined) {
      const nameStr = (data.name || '').trim();
      if (!nameStr) {
          const err = new Error('Name cannot be empty');
          (err as any).status = 400;
          throw err;
      }
      const nameLower = nameStr.toLowerCase();
      const isDuplicateName = nextState.some(a => a.id !== id && a.instanceId === instanceId && a.name.toLowerCase() === nameLower);
      if (isDuplicateName) {
        const err = new Error('Duplicate automation name');
        (err as any).status = 409;
        throw err;
      }
      automation.name = nameStr;
    }

    if (data.enabled !== undefined) {
      automation.enabled = !!data.enabled;
    }

    if (data.trigger !== undefined) {
      if (!isValidTrigger(data.trigger)) {
          const err = new Error('Invalid trigger');
          (err as any).status = 400;
          throw err;
      }
      automation.trigger = data.trigger;
    }

    if (data.message !== undefined) {
      const msgStr = (data.message || '').trim();
      if (!msgStr) {
          const err = new Error('Message cannot be empty');
          (err as any).status = 400;
          throw err;
      }
      automation.message = msgStr;
    }

    if (data.fallbackName !== undefined) {
      const fbStr = (data.fallbackName || '').trim();
      if (!fbStr) {
          const err = new Error('Fallback name cannot be empty');
          (err as any).status = 400;
          throw err;
      }
      automation.fallbackName = fbStr;
    }

    automation.updatedAt = new Date().toISOString();
    
    this.saveState(nextState);
    return automation;
  }

  public delete(id: string, workspaceId: string, instanceId: string): void {
    const idx = this.state.findIndex(a => a.id === id && a.workspaceId === workspaceId && a.instanceId === instanceId);
    if (idx === -1) return;

    const nextState = structuredClone(this.state);
    nextState.splice(idx, 1);
    this.saveState(nextState);
  }

  public findEnabledByTrigger(workspaceId: string, instanceId: string, type: 'contact_added_to_list' | 'tag_added_to_contact', resourceId: string): Automation[] {
    return this.state.filter(a => {
      if (a.workspaceId !== workspaceId || a.instanceId !== instanceId || !a.enabled) return false;
      if (a.trigger.type !== type) return false;
      if (type === 'contact_added_to_list' && (a.trigger as any).listId === resourceId) return true;
      if (type === 'tag_added_to_contact' && (a.trigger as any).tagId === resourceId) return true;
      return false;
    });
  }
}

export const automationService = new AutomationService();
