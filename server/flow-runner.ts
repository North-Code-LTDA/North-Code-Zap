import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { FlowStep } from '../src/types';
import type { FlowService } from './flows.ts';
import { DATA_DIR, type InstanceManager } from './instances.ts';
import type { SchedulerService } from './scheduler.ts';
import type { AutomationTriggerEvent } from './automation-runner.ts';
import { isValidUUID, isValidDateStr, validateFlowStepsStructure } from './flows.ts';

interface FlowExecution {
  id: string;
  workspaceId: string;
  instanceId: string;
  flowId: string;
  flowName: string;
  jid: string;
  status: 'waiting' | 'running';
  remainingSteps: FlowStep[];
  resumeAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const FLOWS_DIR = path.join(DATA_DIR, 'flows');
const EXECUTIONS_FILE = path.join(FLOWS_DIR, 'executions.json');
const EXECUTIONS_TMP_FILE = path.join(FLOWS_DIR, 'executions.json.tmp');

export class FlowRunner {
  private executions: FlowExecution[] = [];
  private loopTimer: NodeJS.Timeout | null = null;
  private instanceManager: InstanceManager;
  private schedulerService: SchedulerService;
  private flowService: FlowService;

  constructor(instanceManager: InstanceManager, schedulerService: SchedulerService, flowService: FlowService) {
    this.instanceManager = instanceManager;
    this.schedulerService = schedulerService;
    this.flowService = flowService;
  }

  init() {
    if (!fs.existsSync(FLOWS_DIR)) fs.mkdirSync(FLOWS_DIR, { recursive: true });
    if (fs.existsSync(EXECUTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(EXECUTIONS_FILE, 'utf8'));
      if (!Array.isArray(data)) throw new Error('executions.json root must be array');
      
      const valid: FlowExecution[] = [];
      let discardedAny = false;
      
      for (const ex of data) {
        if (!ex || typeof ex !== 'object') throw new Error('Null execution record');
        if (!isValidUUID(ex.id) || !isValidUUID(ex.workspaceId) || !isValidUUID(ex.instanceId) || !isValidUUID(ex.flowId)) throw new Error('Invalid UUIDs');
        if (typeof ex.flowName !== 'string' || !ex.flowName.trim()) throw new Error('Invalid flowName');
        if (typeof ex.jid !== 'string' || !ex.jid.trim() || !ex.jid.endsWith('@s.whatsapp.net')) throw new Error('Invalid JID');
        if (ex.status !== 'waiting' && ex.status !== 'running') throw new Error('Invalid status');
        if (!isValidDateStr(ex.createdAt) || !isValidDateStr(ex.updatedAt)) throw new Error('Invalid dates');
        
        if (ex.status === 'waiting') {
          if (!isValidDateStr(ex.resumeAt)) throw new Error('Waiting execution missing valid resumeAt');
        } else if (ex.status === 'running') {
          if (ex.resumeAt !== null) throw new Error('Running execution must have null resumeAt');
        }
        
        if (!Array.isArray(ex.remainingSteps)) throw new Error('Invalid remainingSteps');
        if (ex.remainingSteps.length > 0) {
          validateFlowStepsStructure(ex.remainingSteps);
        }
        
        if (ex.status === 'running') {
          console.log(`[Flow] interrupted running execution discarded id=${ex.id}`);
          discardedAny = true;
          continue;
        }
        valid.push(ex);
      }
      this.executions = valid;
      if (discardedAny) {
        this.persistState(this.executions);
      }
    }
  }

  private persistState(nextState: FlowExecution[]) {
    if (!fs.existsSync(FLOWS_DIR)) fs.mkdirSync(FLOWS_DIR, { recursive: true });
    fs.writeFileSync(EXECUTIONS_TMP_FILE, JSON.stringify(nextState, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(EXECUTIONS_TMP_FILE, EXECUTIONS_FILE);
    this.executions = nextState;
  }

  startLoop() {
    if (this.loopTimer) return;
    this.loopTimer = setInterval(() => this.tick(), 1000);
  }

  async dispatchMany(events: AutomationTriggerEvent[]) {
    for (const e of events) {
      try {
        const flows = this.flowService.findEnabledByTrigger(e.workspaceId, e.instanceId, e.type, 
          e.type === 'contact_added_to_list' ? e.listId! : e.tagId!);
        
        for (const flow of flows) {
          if (!flow.steps || flow.steps.length === 0) continue;
          const ex: FlowExecution = {
            id: randomUUID(),
            workspaceId: flow.workspaceId,
            instanceId: flow.instanceId,
            flowId: flow.id,
            flowName: flow.name,
            jid: e.jid,
            status: 'running',
            remainingSteps: structuredClone(flow.steps),
            resumeAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          
          const nextState = [...this.executions, ex];
          this.persistState(nextState);
          
          this.runExecution(ex).catch(err => console.error(err));
        }
      } catch (err) {
        console.error('[Flow] failed to dispatch event:', err);
      }
    }
  }

  private async tick() {
    const now = new Date().toISOString();
    const due = this.executions.filter(ex => ex.status === 'waiting' && ex.resumeAt && ex.resumeAt <= now);
    if (due.length === 0) return;

    const nextState = structuredClone(this.executions);
    const updatedDue: FlowExecution[] = [];

    for (const ex of nextState) {
      if (ex.status === 'waiting' && ex.resumeAt && ex.resumeAt <= now) {
        ex.status = 'running';
        ex.resumeAt = null;
        ex.updatedAt = new Date().toISOString();
        updatedDue.push(ex);
      }
    }
    
    this.persistState(nextState);

    for (const ex of updatedDue) {
      this.runExecution(ex).catch(err => console.error(err));
    }
  }

  private async runExecution(ex: FlowExecution) {
    while (ex.remainingSteps.length > 0) {
      if (!this.executions.some(e => e.id === ex.id)) {
        return;
      }
      
      const step = ex.remainingSteps.shift()!;
      try {
        const runtime = this.instanceManager.getForWorkspace(ex.instanceId, ex.workspaceId);
        if (!runtime) throw new Error('Instance not running');

        if (step.type === 'delay') {
          ex.status = 'waiting';
          ex.resumeAt = new Date(Date.now() + step.durationSeconds * 1000).toISOString();
          ex.updatedAt = new Date().toISOString();
          
          const nextState = structuredClone(this.executions);
          const idx = nextState.findIndex(e => e.id === ex.id);
          if (idx !== -1) {
            nextState[idx] = ex;
          } else {
            nextState.push(ex);
          }
          this.persistState(nextState);
          return;
        }

        if (step.type === 'send_message') {
          let label = ex.jid.split('@')[0];
          let name: string | undefined = undefined;
          const contact = runtime.contacts.getContact(ex.jid);
          if (contact && contact.name && contact.name.trim()) {
            name = contact.name.trim();
            label = name;
          }
          
          const result = await this.schedulerService.executeTransientMessage({
            instanceId: ex.instanceId,
            name: ex.flowName,
            message: step.message,
            target: {
               type: 'person',
               jid: ex.jid,
               label,
               ...(name ? { name } : {}),
               source: 'directory'
            },
            fallbackName: step.fallbackName
          });
          
          if (result.sentCount !== 1) throw new Error('Message sending failed');
        } else if (step.type === 'add_tag') {
           const audiences = runtime.audiences.getState();
           if (audiences.tags.some(t => t.id === step.tagId)) {
             runtime.audiences.addTagToContacts(step.tagId, [ex.jid]);
           } else throw new Error('Tag not found');
        } else if (step.type === 'remove_tag') {
           const audiences = runtime.audiences.getState();
           if (audiences.tags.some(t => t.id === step.tagId)) {
             runtime.audiences.removeTagFromContacts(step.tagId, [ex.jid]);
           } else throw new Error('Tag not found');
        } else if (step.type === 'add_to_list') {
           const audiences = runtime.audiences.getState();
           const l = audiences.lists.find(x => x.id === step.listId);
           if (l) {
             if (!l.contactJids.includes(ex.jid)) runtime.audiences.updateListContacts(step.listId, [...l.contactJids, ex.jid]);
           } else throw new Error('List not found');
        } else if (step.type === 'remove_from_list') {
           const audiences = runtime.audiences.getState();
           const l = audiences.lists.find(x => x.id === step.listId);
           if (l) {
             if (l.contactJids.includes(ex.jid)) {
               runtime.audiences.updateListContacts(step.listId, l.contactJids.filter(j => j !== ex.jid));
             }
           } else throw new Error('List not found');
        } else if (step.type === 'condition') {
           const audiences = runtime.audiences.getState();
           let result = false;
           if (step.condition.type === 'has_tag') {
             const cond = step.condition as Extract<typeof step.condition, { type: 'has_tag' }>;
             if (!audiences.tags.some(t => t.id === cond.tagId)) throw new Error('Condition tag not found');
             result = (audiences.contactTags[ex.jid] || []).includes(cond.tagId);
           } else if (step.condition.type === 'in_list') {
             const cond = step.condition as Extract<typeof step.condition, { type: 'in_list' }>;
             const l = audiences.lists.find(x => x.id === cond.listId);
             if (!l) throw new Error('Condition list not found');
             result = l.contactJids.includes(ex.jid);
           }
           const branch = result ? step.ifTrue : step.ifFalse;
           if (branch && branch.length > 0) {
             ex.remainingSteps = [...structuredClone(branch), ...ex.remainingSteps];
           }
        }
      } catch (err) {
        console.error(`[Flow] execution failed for flow ${ex.flowId}:`, err);
        const nextState = this.executions.filter(e => e.id !== ex.id);
        this.persistState(nextState);
        return;
      }
    }

    const nextState = this.executions.filter(e => e.id !== ex.id);
    this.persistState(nextState);
  }

  cancelForFlow(flowId: string, workspaceId: string, instanceId: string) {
    const nextState = this.executions.filter(e => !(e.flowId === flowId && e.workspaceId === workspaceId && e.instanceId === instanceId));
    if (nextState.length !== this.executions.length) this.persistState(nextState);
  }

  cancelForInstance(instanceId: string) {
    const nextState = this.executions.filter(e => e.instanceId !== instanceId);
    if (nextState.length !== this.executions.length) this.persistState(nextState);
  }
}

