import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { MessageTemplate } from '../src/types';
import { DATA_DIR } from './instances';

const TEMPLATES_DIR = path.join(DATA_DIR, 'templates');
const TEMPLATES_FILE = path.join(TEMPLATES_DIR, 'templates.json');

function isValidUuid(id: any): boolean {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isValidDate(dateStr: any): boolean {
  if (typeof dateStr !== 'string') return false;
  return !isNaN(Date.parse(dateStr));
}

export class TemplateService {
  private state: MessageTemplate[] = [];

  public init() {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    }

    if (!fs.existsSync(TEMPLATES_FILE)) {
      this.state = [];
      return;
    }

    const content = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error('Templates root is not an array');
    }

    const ids = new Set<string>();
    const namesByWorkspace = new Map<string, Set<string>>();

    for (const record of parsed) {
      if (!record || typeof record !== 'object') {
        throw new Error('Invalid template record');
      }

      if (!isValidUuid(record.id)) throw new Error(`Invalid id: ${record.id}`);
      if (!isValidUuid(record.workspaceId)) throw new Error(`Invalid workspaceId: ${record.workspaceId}`);

      if (typeof record.name !== 'string' || record.name.trim().length === 0) {
        throw new Error('Invalid name');
      }
      if (typeof record.message !== 'string' || record.message.trim().length === 0) {
        throw new Error('Invalid message');
      }
      if (typeof record.fallbackName !== 'string' || record.fallbackName.trim().length === 0) {
        throw new Error('Invalid fallbackName');
      }
      if (!isValidDate(record.createdAt)) {
        throw new Error('Invalid createdAt');
      }
      if (!isValidDate(record.updatedAt)) {
        throw new Error('Invalid updatedAt');
      }

      if (ids.has(record.id)) {
        throw new Error(`Duplicate Template ID: ${record.id}`);
      }
      ids.add(record.id);

      let wsNames = namesByWorkspace.get(record.workspaceId);
      if (!wsNames) {
        wsNames = new Set<string>();
        namesByWorkspace.set(record.workspaceId, wsNames);
      }
      const lowerName = record.name.trim().toLowerCase();
      if (wsNames.has(lowerName)) {
        throw new Error(`Duplicate template name in workspace: ${lowerName}`);
      }
      wsNames.add(lowerName);
    }

    this.state = parsed;
  }

  private persist(newState: MessageTemplate[]) {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    }
    const tmp = `${TEMPLATES_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(newState, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, TEMPLATES_FILE);
    this.state = newState;
  }

  public listForWorkspace(workspaceId: string): MessageTemplate[] {
    const records = this.state.filter(r => r.workspaceId === workspaceId);
    records.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return records;
  }

  public getForWorkspace(id: string, workspaceId: string): MessageTemplate | undefined {
    return this.state.find(r => r.id === id && r.workspaceId === workspaceId);
  }

  public create(workspaceId: string, data: { name: string; message: string; fallbackName: string }): MessageTemplate {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new Error('Invalid name');
    }
    if (typeof data.message !== 'string' || data.message.trim().length === 0) {
      throw new Error('Invalid message');
    }
    if (typeof data.fallbackName !== 'string' || data.fallbackName.trim().length === 0) {
      throw new Error('Invalid fallbackName');
    }

    const lowerName = data.name.trim().toLowerCase();
    const isDuplicate = this.state.some(r => r.workspaceId === workspaceId && r.name.trim().toLowerCase() === lowerName);
    
    if (isDuplicate) {
      const err = new Error('Template with this name already exists');
      (err as any).status = 409;
      throw err;
    }

    const now = new Date().toISOString();
    const newRecord: MessageTemplate = {
      id: randomUUID(),
      workspaceId,
      name: data.name.trim(),
      message: data.message.trim(),
      fallbackName: data.fallbackName.trim(),
      createdAt: now,
      updatedAt: now
    };

    const nextState = structuredClone(this.state);
    nextState.push(newRecord);
    this.persist(nextState);

    return newRecord;
  }

  public update(id: string, workspaceId: string, data: { name?: string; message?: string; fallbackName?: string }): MessageTemplate {
    const existing = this.getForWorkspace(id, workspaceId);
    if (!existing) {
      const err = new Error('Template not found');
      (err as any).status = 404;
      throw err;
    }

    const newName = (typeof data.name === 'string' && data.name.trim().length > 0) ? data.name.trim() : existing.name;
    const newMessage = (typeof data.message === 'string' && data.message.trim().length > 0) ? data.message.trim() : existing.message;
    const newFallback = (typeof data.fallbackName === 'string' && data.fallbackName.trim().length > 0) ? data.fallbackName.trim() : existing.fallbackName;

    const lowerName = newName.toLowerCase();
    const isDuplicate = this.state.some(r => r.workspaceId === workspaceId && r.id !== id && r.name.trim().toLowerCase() === lowerName);
    
    if (isDuplicate) {
      const err = new Error('Template with this name already exists');
      (err as any).status = 409;
      throw err;
    }

    const nextState = structuredClone(this.state);
    const index = nextState.findIndex(r => r.id === id && r.workspaceId === workspaceId);
    
    nextState[index] = {
      ...nextState[index],
      name: newName,
      message: newMessage,
      fallbackName: newFallback,
      updatedAt: new Date().toISOString()
    };

    this.persist(nextState);
    return nextState[index];
  }

  public delete(id: string, workspaceId: string): void {
    const existing = this.getForWorkspace(id, workspaceId);
    if (!existing) {
      const err = new Error('Template not found');
      (err as any).status = 404;
      throw err;
    }

    const nextState = this.state.filter(r => !(r.id === id && r.workspaceId === workspaceId));
    this.persist(nextState);
  }
}

export const templateService = new TemplateService();
