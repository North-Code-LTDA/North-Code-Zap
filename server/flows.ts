import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Flow, FlowStep, FlowTrigger } from '../src/types';
import { DATA_DIR, type InstanceManager } from './instances.ts';

const FLOWS_DIR = path.join(DATA_DIR, 'flows');
const FLOWS_FILE = path.join(FLOWS_DIR, 'flows.json');
const FLOWS_TMP_FILE = path.join(FLOWS_DIR, 'flows.json.tmp');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(uuid: any) {
  return typeof uuid === 'string' && UUID_REGEX.test(uuid);
}
export function isValidDateStr(d: any) {
  if (typeof d !== 'string' || !d) return false;
  const date = new Date(d);
  return !isNaN(date.getTime());
}

export function validateFlowStepsStructure(steps: any[], depth = 0, ids = new Set<string>(), total = { count: 0 }) {
  if (!Array.isArray(steps)) throw new Error('Steps must be an array');
  if (depth > 5) throw new Error('Max condition depth 5 exceeded');
  for (const step of steps) {
    if (!step || typeof step !== 'object') throw new Error('Invalid step object');
    if (!isValidUUID(step.id)) throw new Error('Step missing or invalid ID');
    if (ids.has(step.id)) throw new Error('Duplicate Step ID');
    ids.add(step.id);
    total.count++;
    if (total.count > 50) throw new Error('Max 50 steps exceeded');

    if (step.type === 'send_message') {
      if (typeof step.message !== 'string' || !step.message.trim()) throw new Error('Empty message');
      if (typeof step.fallbackName !== 'string' || !step.fallbackName.trim()) throw new Error('Empty fallbackName');
    } else if (step.type === 'delay') {
      if (!Number.isInteger(step.durationSeconds) || step.durationSeconds < 1 || step.durationSeconds > 2592000) {
        throw new Error('Invalid delay durationSeconds');
      }
    } else if (step.type === 'condition') {
      if (!step.condition || typeof step.condition !== 'object' || Array.isArray(step.condition)) throw new Error('Invalid condition');
      if (step.condition.type !== 'has_tag' && step.condition.type !== 'in_list') throw new Error('Invalid condition type');
      if (step.condition.type === 'has_tag' && !isValidUUID(step.condition.tagId)) throw new Error('Invalid condition tagId');
      if (step.condition.type === 'in_list' && !isValidUUID(step.condition.listId)) throw new Error('Invalid condition listId');
      
      const nextDepth = depth + 1;
      if (nextDepth > 5) throw new Error('Max condition depth 5 exceeded');
      
      validateFlowStepsStructure(step.ifTrue || [], nextDepth, ids, total);
      validateFlowStepsStructure(step.ifFalse || [], nextDepth, ids, total);
    } else if (['add_tag', 'remove_tag'].includes(step.type)) {
      if (!isValidUUID(step.tagId)) throw new Error('Invalid action tagId');
    } else if (['add_to_list', 'remove_from_list'].includes(step.type)) {
      if (!isValidUUID(step.listId)) throw new Error('Invalid action listId');
    } else {
      throw new Error('Unknown step type');
    }
  }
}

export class FlowService {
  private state: Flow[] = [];
  private instanceManager: InstanceManager;

  constructor(instanceManager: InstanceManager) {
    this.instanceManager = instanceManager;
  }

  init() {
    if (!fs.existsSync(FLOWS_DIR)) {
      fs.mkdirSync(FLOWS_DIR, { recursive: true });
    }
    if (fs.existsSync(FLOWS_FILE)) {
      const data = fs.readFileSync(FLOWS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) throw new Error('flows.json root must be an array');
      
      const ids = new Set<string>();
      const names = new Set<string>();
      parsed.forEach(f => {
        if (!f || typeof f !== 'object') throw new Error('Null flow record');
        if (!isValidUUID(f.id) || !isValidUUID(f.workspaceId) || !isValidUUID(f.instanceId)) throw new Error('Invalid UUIDs');
        if (typeof f.name !== 'string' || !f.name.trim()) throw new Error('Invalid Flow name');
        if (typeof f.enabled !== 'boolean') throw new Error('Invalid enabled flag');
        if (!isValidDateStr(f.createdAt) || !isValidDateStr(f.updatedAt)) throw new Error('Invalid dates');
        
        if (!f.trigger || typeof f.trigger !== 'object' || Array.isArray(f.trigger)) throw new Error('Invalid trigger');
        if (f.trigger.type === 'contact_added_to_list') {
          if (!isValidUUID(f.trigger.listId)) throw new Error('Invalid trigger listId');
        } else if (f.trigger.type === 'tag_added_to_contact') {
          if (!isValidUUID(f.trigger.tagId)) throw new Error('Invalid trigger tagId');
        } else {
          throw new Error('Unknown trigger type');
        }

        if (!Array.isArray(f.steps) || f.steps.length === 0) throw new Error('Steps empty or invalid');
        validateFlowStepsStructure(f.steps);

        if (ids.has(f.id)) throw new Error('Duplicate Flow ID');
        ids.add(f.id);

        const nameKey = `${f.workspaceId}:${f.instanceId}:${f.name.toLowerCase()}`;
        if (names.has(nameKey)) throw new Error('Duplicate Flow name in instance');
        names.add(nameKey);
      });
      this.state = parsed;
    }
  }

  private persistState(nextState: Flow[]) {
    if (!fs.existsSync(FLOWS_DIR)) fs.mkdirSync(FLOWS_DIR, { recursive: true });
    fs.writeFileSync(FLOWS_TMP_FILE, JSON.stringify(nextState, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(FLOWS_TMP_FILE, FLOWS_FILE);
    this.state = nextState;
  }

  listForInstance(workspaceId: string, instanceId: string) {
    return this.state
      .filter(f => f.workspaceId === workspaceId && f.instanceId === instanceId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  getForInstance(id: string, workspaceId: string, instanceId: string) {
    return this.state.find(f => f.id === id && f.workspaceId === workspaceId && f.instanceId === instanceId);
  }

  findEnabledByTrigger(workspaceId: string, instanceId: string, type: string, resourceId: string) {
    return this.state.filter(f => 
      f.enabled && 
      f.workspaceId === workspaceId && 
      f.instanceId === instanceId &&
      f.trigger.type === type &&
      ((f.trigger.type === 'contact_added_to_list' && f.trigger.listId === resourceId) || 
       (f.trigger.type === 'tag_added_to_contact' && f.trigger.tagId === resourceId))
    );
  }

  private validateResources(trigger: FlowTrigger, steps: FlowStep[], workspaceId: string, instanceId: string) {
    const runtime = this.instanceManager.getForWorkspace(instanceId, workspaceId);
    if (!runtime) throw Object.assign(new Error('Instance not found'), { status: 404 });
    const audiences = runtime.audiences.getState();

    const checkList = (id: string) => { if (!audiences.lists.some(l => l.id === id)) throw Object.assign(new Error('List not found'), { status: 400 }); };
    const checkTag = (id: string) => { if (!audiences.tags.some(t => t.id === id)) throw Object.assign(new Error('Tag not found'), { status: 400 }); };

    if (trigger.type === 'contact_added_to_list') {
      if (!trigger.listId) throw Object.assign(new Error('Invalid trigger'), { status: 400 });
      checkList(trigger.listId);
    } else if (trigger.type === 'tag_added_to_contact') {
      if (!trigger.tagId) throw Object.assign(new Error('Invalid trigger'), { status: 400 });
      checkTag(trigger.tagId);
    } else {
      throw Object.assign(new Error('Invalid trigger type'), { status: 400 });
    }

    const checkSteps = (st: FlowStep[]) => {
      for (const s of st) {
        if (s.type === 'add_to_list' || s.type === 'remove_from_list') checkList(s.listId);
        if (s.type === 'add_tag' || s.type === 'remove_tag') checkTag(s.tagId);
        if (s.type === 'condition') {
          if (s.condition.type === 'in_list') checkList(s.condition.listId);
          if (s.condition.type === 'has_tag') checkTag(s.condition.tagId);
          checkSteps(s.ifTrue);
          checkSteps(s.ifFalse);
        }
      }
    };
    checkSteps(steps);
  }

  create(workspaceId: string, instanceId: string, data: any): Flow {
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) throw Object.assign(new Error('Invalid name'), { status: 400 });
    const name = data.name.trim();
    if (this.state.some(f => f.workspaceId === workspaceId && f.instanceId === instanceId && f.name.toLowerCase() === name.toLowerCase())) {
      throw Object.assign(new Error('Duplicate Flow name in this instance'), { status: 409 });
    }

    const enabled = data.enabled !== undefined ? data.enabled : true;
    if (typeof enabled !== 'boolean') throw Object.assign(new Error('Invalid enabled state'), { status: 400 });

    if (!data.trigger || typeof data.trigger !== 'object') throw Object.assign(new Error('Invalid trigger'), { status: 400 });
    if (!Array.isArray(data.steps) || data.steps.length === 0) throw Object.assign(new Error('Steps cannot be empty'), { status: 400 });

    validateFlowStepsStructure(data.steps);
    this.validateResources(data.trigger, data.steps, workspaceId, instanceId);

    const flow: Flow = {
      id: randomUUID(),
      workspaceId,
      instanceId,
      name,
      enabled,
      trigger: structuredClone(data.trigger),
      steps: structuredClone(data.steps),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const nextState = structuredClone(this.state);
    nextState.push(flow);
    this.persistState(nextState);
    return flow;
  }

  update(id: string, workspaceId: string, instanceId: string, data: any): Flow {
    const existing = this.getForInstance(id, workspaceId, instanceId);
    if (!existing) throw Object.assign(new Error('Flow not found'), { status: 404 });

    const nextState = structuredClone(this.state);
    const flow = nextState.find(f => f.id === id)!;

    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || !data.name.trim()) throw Object.assign(new Error('Invalid name'), { status: 400 });
      const name = data.name.trim();
      if (nextState.some(f => f.id !== id && f.workspaceId === workspaceId && f.instanceId === instanceId && f.name.toLowerCase() === name.toLowerCase())) {
        throw Object.assign(new Error('Duplicate Flow name in this instance'), { status: 409 });
      }
      flow.name = name;
    }

    if (data.enabled !== undefined) {
      if (typeof data.enabled !== 'boolean') throw Object.assign(new Error('Invalid enabled state'), { status: 400 });
      flow.enabled = data.enabled;
    }

    if (data.trigger !== undefined) {
      if (!data.trigger || typeof data.trigger !== 'object') throw Object.assign(new Error('Invalid trigger'), { status: 400 });
      flow.trigger = structuredClone(data.trigger);
    }

    if (data.steps !== undefined) {
      if (!Array.isArray(data.steps) || data.steps.length === 0) throw Object.assign(new Error('Steps cannot be empty'), { status: 400 });
      validateFlowStepsStructure(data.steps);
      flow.steps = structuredClone(data.steps);
    }

    if (data.trigger !== undefined || data.steps !== undefined) {
      this.validateResources(flow.trigger, flow.steps, workspaceId, instanceId);
    }

    flow.updatedAt = new Date().toISOString();
    this.persistState(nextState);
    return flow;
  }

  delete(id: string, workspaceId: string, instanceId: string) {
    const existing = this.getForInstance(id, workspaceId, instanceId);
    if (!existing) throw Object.assign(new Error('Flow not found'), { status: 404 });
    const nextState = this.state.filter(f => f.id !== id);
    this.persistState(nextState);
  }

  deleteAllForInstance(instanceId: string) {
    const nextState = this.state.filter(f => f.instanceId !== instanceId);
    if (nextState.length !== this.state.length) {
      this.persistState(nextState);
    }
  }
}

