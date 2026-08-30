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
  private suspendedWorkspaces = new Set<string>();

  public suspendWorkspace(workspaceId: string) {
    this.suspendedWorkspaces.add(workspaceId);
  }

  public resumeWorkspace(workspaceId: string) {
    this.suspendedWorkspaces.delete(workspaceId);
  }

  public isWorkspaceBusy(workspaceId: string): boolean {
    return this.executions.some(e => e.workspaceId === workspaceId && e.status === 'running');
  }


  private validateExecution(ex: any): boolean {
    const isValidUUID = (s: any) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
    const isValidDateStr = (s: any) => typeof s === 'string' && !isNaN(new Date(s).getTime());

    if (!ex || typeof ex !== 'object') return false;
    if (!isValidUUID(ex.id) || !isValidUUID(ex.workspaceId) || !isValidUUID(ex.instanceId) || !isValidUUID(ex.flowId)) return false;
    if (typeof ex.flowName !== 'string' || !ex.flowName.trim()) return false;
    if (typeof ex.jid !== 'string' || !ex.jid.trim() || !ex.jid.endsWith('@s.whatsapp.net')) return false;
    if (ex.status !== 'waiting' && ex.status !== 'running') return false;
    if (!isValidDateStr(ex.createdAt) || !isValidDateStr(ex.updatedAt)) return false;
    
    if (ex.status === 'waiting') {
      if (!isValidDateStr(ex.resumeAt)) return false;
    } else if (ex.status === 'running') {
      if (ex.resumeAt !== null) return false;
    }
    
    if (!Array.isArray(ex.remainingSteps)) return false;
    // We trust validateFlowStepsStructure from util or inline it here
    
    return true;
  }

  public reloadWorkspaceFromDisk(workspaceId: string) {
    const EXECUTIONS_FILE = require('path').join(require('./instances.ts').DATA_DIR, 'flows', 'executions.json');
    if (!fs.existsSync(EXECUTIONS_FILE)) return;
    try {
       const data = JSON.parse(fs.readFileSync(EXECUTIONS_FILE, 'utf8'));
       let discardedAny = false;
       const workspaceExecutions = data.filter((e) => {
         if (e.workspaceId !== workspaceId) return false;
         if (!this.validateExecution(e)) {
            // we'll fail if invalid metadata
            throw new Error(`Execução inválida: ${e.id}`);
         }
         return true;
       });
       
       // Remove old ones for this workspace
       this.executions = this.executions.filter((e) => e.workspaceId !== workspaceId);
       
       // Add the loaded ones
       for (const ex of workspaceExecutions) {
          if (ex.status === 'running') {
             discardedAny = true;
             continue; // Discard completely
          }
          this.executions.push(ex);
       }
       if (discardedAny) {
          // Sync to disk to remove running executions from file
          const allDisk = JSON.parse(fs.readFileSync(EXECUTIONS_FILE, 'utf8'));
          const filteredDisk = allDisk.filter(d => !(d.workspaceId === workspaceId && d.status === 'running'));
          fs.writeFileSync(EXECUTIONS_FILE, JSON.stringify(filteredDisk, null, 2));
       }
    } catch(e) {
       console.error('[FlowRunner] Error reloading workspace', e);
    }
  }

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
        if (!this.validateExecution(ex)) throw new Error(`Invalid execution record: ${ex?.id || 'unknown'}`);
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
      if (discardedAny) {
        this.persistState(valid);
      } else {
        this.executions = valid;
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
      if (this.suspendedWorkspaces.has(e.workspaceId)) continue;
      let flows: any[] = [];
      try {
        flows = this.flowService.findEnabledByTrigger(e.workspaceId, e.instanceId, e.type, 
          e.type === 'contact_added_to_list' ? e.listId! : e.tagId!);
      } catch (err) {
        console.error('[Flow] failed to find flows:', err);
        continue;
      }

      for (const flow of flows) {
        try {
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
        } catch (err) {
          console.error(`[Flow] failed to start flow ${flow.id}:`, err);
        }
      }
    }
  }

  private async tick() {
    const now = new Date().toISOString();
    const due = this.executions.filter(ex => ex.status === 'waiting' && ex.resumeAt && ex.resumeAt <= now && !this.suspendedWorkspaces.has(ex.workspaceId));
    if (due.length === 0) return;

    const nextState = structuredClone(this.executions);
    const updatedDue: FlowExecution[] = [];

    for (const ex of nextState) {
      if (ex.status === 'waiting' && ex.resumeAt && ex.resumeAt <= now && !this.suspendedWorkspaces.has(ex.workspaceId)) {
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

