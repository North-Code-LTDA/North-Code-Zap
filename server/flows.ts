import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Flow, FlowStep, FlowTrigger } from '../src/types';
import type { InstanceManager } from './instances';

const FLOWS_DIR = path.join(process.env.DATA_DIR || './data', 'flows');
const FLOWS_FILE = path.join(FLOWS_DIR, 'flows.json');

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
      
      parsed.forEach(f => {
        if (!f.id || !f.workspaceId || !f.instanceId || !f.name || typeof f.enabled !== 'boolean') {
          throw new Error('Malformed flow record');
        }
        if (!f.trigger || !f.trigger.type || !Array.isArray(f.steps)) {
          throw new Error('Malformed flow record');
        }
        if (!f.createdAt || !f.updatedAt) {
          throw new Error('Malformed flow record');
        }
      });
      
      const ids = new Set();
      parsed.forEach(f => {
        if (ids.has(f.id)) throw new Error('Duplicate Flow ID');
        ids.add(f.id);
      });
      this.state = parsed;
    }
  }

  private persist() {
    const tmp = FLOWS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FLOWS_FILE);
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

  private validateSteps(steps: FlowStep[], depth = 1, ids = new Set<string>(), total = { count: 0 }) {
    if (depth > 5) throw new Error('Max condition depth 5 exceeded');
    for (const step of steps) {
      if (!step.id) throw new Error('Step missing ID');
      if (ids.has(step.id)) throw new Error('Duplicate Step ID');
      ids.add(step.id);
      total.count++;
      if (total.count > 50) throw new Error('Max 50 steps exceeded');

      if (step.type === 'send_message') {
        if (!step.message || !step.message.trim()) throw new Error('Empty message');
        if (!step.fallbackName || !step.fallbackName.trim()) throw new Error('Empty fallbackName');
      } else if (step.type === 'delay') {
        if (typeof step.durationSeconds !== 'number' || step.durationSeconds < 1 || step.durationSeconds > 2592000) {
          throw new Error('Invalid delay durationSeconds');
        }
      } else if (step.type === 'condition') {
        if (!step.condition || typeof step.condition !== 'object' || Array.isArray(step.condition)) throw new Error('Invalid condition');
        if (step.condition.type !== 'has_tag' && step.condition.type !== 'in_list') throw new Error('Invalid condition type');
        if (!Array.isArray(step.ifTrue) || !Array.isArray(step.ifFalse)) throw new Error('Condition branches must be arrays');
        this.validateSteps(step.ifTrue, depth + 1, ids, total);
        this.validateSteps(step.ifFalse, depth + 1, ids, total);
      } else if (['add_tag', 'remove_tag', 'add_to_list', 'remove_from_list'].includes(step.type)) {
        // basic valid type
      } else {
        throw new Error('Unknown step type');
      }
    }
  }

  private validateResources(trigger: FlowTrigger, steps: FlowStep[], workspaceId: string, instanceId: string) {
    const runtime = this.instanceManager.getForWorkspace(instanceId, workspaceId);
    if (!runtime) throw new Error('Instance not found');
    const audiences = runtime.audiences.getState();

    const checkList = (id: string) => { if (!audiences.lists.some(l => l.id === id)) throw new Error('List not found'); };
    const checkTag = (id: string) => { if (!audiences.tags.some(t => t.id === id)) throw new Error('Tag not found'); };

    if (trigger.type === 'contact_added_to_list') {
      if (!trigger.listId) throw new Error('Invalid trigger');
      checkList(trigger.listId);
    } else if (trigger.type === 'tag_added_to_contact') {
      if (!trigger.tagId) throw new Error('Invalid trigger');
      checkTag(trigger.tagId);
    } else {
      throw new Error('Invalid trigger type');
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
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) throw new Error('Invalid name');
    const name = data.name.trim();
    if (this.state.some(f => f.workspaceId === workspaceId && f.instanceId === instanceId && f.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Duplicate Flow name in this instance');
    }

    const enabled = data.enabled !== undefined ? data.enabled : true;
    if (typeof enabled !== 'boolean') throw new Error('Invalid enabled state');

    if (!data.trigger || typeof data.trigger !== 'object') throw new Error('Invalid trigger');
    if (!Array.isArray(data.steps) || data.steps.length === 0) throw new Error('Steps cannot be empty');

    this.validateSteps(data.steps);
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
    this.state = nextState;
    this.persist();
    return flow;
  }

  update(id: string, workspaceId: string, instanceId: string, data: any): Flow {
    const existing = this.getForInstance(id, workspaceId, instanceId);
    if (!existing) throw new Error('Flow not found');

    const nextState = structuredClone(this.state);
    const flow = nextState.find(f => f.id === id)!;

    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || !data.name.trim()) throw new Error('Invalid name');
      const name = data.name.trim();
      if (nextState.some(f => f.id !== id && f.workspaceId === workspaceId && f.instanceId === instanceId && f.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('Duplicate Flow name in this instance');
      }
      flow.name = name;
    }

    if (data.enabled !== undefined) {
      if (typeof data.enabled !== 'boolean') throw new Error('Invalid enabled state');
      flow.enabled = data.enabled;
    }

    if (data.trigger !== undefined) {
      if (!data.trigger || typeof data.trigger !== 'object') throw new Error('Invalid trigger');
      flow.trigger = structuredClone(data.trigger);
    }

    if (data.steps !== undefined) {
      if (!Array.isArray(data.steps) || data.steps.length === 0) throw new Error('Steps cannot be empty');
      this.validateSteps(data.steps);
      flow.steps = structuredClone(data.steps);
    }

    if (data.trigger !== undefined || data.steps !== undefined) {
      this.validateResources(flow.trigger, flow.steps, workspaceId, instanceId);
    }

    flow.updatedAt = new Date().toISOString();
    this.state = nextState;
    this.persist();
    return flow;
  }

  delete(id: string, workspaceId: string, instanceId: string) {
    const len = this.state.length;
    this.state = this.state.filter(f => !(f.id === id && f.workspaceId === workspaceId && f.instanceId === instanceId));
    if (this.state.length !== len) this.persist();
  }

  deleteAllForInstance(instanceId: string) {
    const len = this.state.length;
    this.state = this.state.filter(f => f.instanceId !== instanceId);
    if (this.state.length !== len) this.persist();
  }
}

