import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { FlowStep } from '../src/types';
import type { FlowService } from './flows';
import type { InstanceManager } from './instances';
import type { SchedulerService } from './scheduler';
import type { AutomationTriggerEvent } from './automation-runner';

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

const FLOWS_DIR = path.join(process.env.DATA_DIR || './data', 'flows');
const EXECUTIONS_FILE = path.join(FLOWS_DIR, 'executions.json');

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
      for (const ex of data) {
        if (!ex.id || !ex.workspaceId || !ex.instanceId || !ex.flowId || !ex.flowName || !ex.jid || !ex.status || !Array.isArray(ex.remainingSteps)) {
          throw new Error('Malformed execution record');
        }
        if (ex.status === 'running') {
          console.log(`[Flow] interrupted running execution discarded: ${ex.id}`);
          continue;
        }
        valid.push(ex);
      }
      this.executions = valid;
      this.persist();
    }
  }

  private persist() {
    const tmp = EXECUTIONS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.executions, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, EXECUTIONS_FILE);
  }

  startLoop() {
    this.loopTimer = setInterval(() => this.tick(), 1000);
  }

  async dispatchMany(events: AutomationTriggerEvent[]) {
    for (const e of events) {
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
        this.runExecution(ex).catch(err => console.error(err));
      }
    }
  }

  private async tick() {
    const now = new Date().toISOString();
    const due = this.executions.filter(ex => ex.status === 'waiting' && ex.resumeAt && ex.resumeAt <= now);
    if (due.length === 0) return;

    for (const ex of due) {
      ex.status = 'running';
      ex.resumeAt = null;
      ex.updatedAt = new Date().toISOString();
    }
    this.persist();

    for (const ex of due) {
      this.runExecution(ex).catch(err => console.error(err));
    }
  }

  private async runExecution(ex: FlowExecution) {
    while (ex.remainingSteps.length > 0) {
      const step = ex.remainingSteps.shift()!;
      try {
        const runtime = this.instanceManager.getForWorkspace(ex.instanceId, ex.workspaceId);
        if (!runtime) throw new Error('Instance not running');

        if (step.type === 'delay') {
          ex.status = 'waiting';
          ex.resumeAt = new Date(Date.now() + step.durationSeconds * 1000).toISOString();
          ex.updatedAt = new Date().toISOString();
          
          const idx = this.executions.findIndex(e => e.id === ex.id);
          if (idx === -1) this.executions.push(ex);
          
          this.persist();
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
           }
        } else if (step.type === 'add_to_list') {
           const audiences = runtime.audiences.getState();
           const l = audiences.lists.find(x => x.id === step.listId);
           if (l) {
             if (!l.contactJids.includes(ex.jid)) runtime.audiences.updateListContacts(step.listId, [...l.contactJids, ex.jid]);
           } else throw new Error('List not found');
        } else if (step.type === 'remove_from_list') {
           const audiences = runtime.audiences.getState();
           const l = audiences.lists.find(x => x.id === step.listId);
           if (l && l.contactJids.includes(ex.jid)) {
             runtime.audiences.updateListContacts(step.listId, l.contactJids.filter(j => j !== ex.jid));
           }
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
        const idx = this.executions.findIndex(e => e.id === ex.id);
        if (idx !== -1) {
          this.executions.splice(idx, 1);
          this.persist();
        }
        return;
      }
    }

    const idx = this.executions.findIndex(e => e.id === ex.id);
    if (idx !== -1) {
      this.executions.splice(idx, 1);
      this.persist();
    }
  }

  cancelForFlow(flowId: string, workspaceId: string, instanceId: string) {
    const len = this.executions.length;
    this.executions = this.executions.filter(e => !(e.flowId === flowId && e.workspaceId === workspaceId && e.instanceId === instanceId));
    if (this.executions.length !== len) this.persist();
  }

  cancelForInstance(instanceId: string) {
    const len = this.executions.length;
    this.executions = this.executions.filter(e => e.instanceId !== instanceId);
    if (this.executions.length !== len) this.persist();
  }
}

