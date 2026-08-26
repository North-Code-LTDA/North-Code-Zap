import { automationService } from './automations';
import { ScheduledTarget } from '../src/types';
import type { InstanceManager } from './instances';
import type { SchedulerService } from './scheduler';

export type AutomationTriggerEvent =
  | {
      type: 'contact_added_to_list';
      workspaceId: string;
      instanceId: string;
      listId: string;
      jid: string;
    }
  | {
      type: 'tag_added_to_contact';
      workspaceId: string;
      instanceId: string;
      tagId: string;
      jid: string;
    };

export class AutomationRunner {
  constructor(
    private instanceManager: InstanceManager,
    private schedulerService: SchedulerService
  ) {}

  public async dispatchMany(events: AutomationTriggerEvent[]) {
    for (const event of events) {
      try {
        await this.dispatch(event);
      } catch (err) {
        console.error('[Automation] Failed to dispatch event:', err);
      }
    }
  }

  private async dispatch(event: AutomationTriggerEvent) {
    const resourceId = event.type === 'contact_added_to_list' ? event.listId : event.tagId;
    const automations = automationService.findEnabledByTrigger(
      event.workspaceId,
      event.instanceId,
      event.type,
      resourceId
    );

    if (automations.length === 0) {
      return;
    }

    const runtime = this.instanceManager.getForWorkspace(event.instanceId, event.workspaceId);
    if (!runtime) {
      console.warn(`[Automation] Instance runtime not found for ${event.instanceId}`);
      return;
    }

    const contact = runtime.contacts.getContact(event.jid);
    
    // Resolve name or use raw phone
    let targetName = contact?.name?.trim();
    
    let target: ScheduledTarget;
    if (targetName) {
      target = {
        type: 'person',
        jid: event.jid,
        label: targetName,
        name: targetName,
        source: 'directory'
      };
    } else {
      const numericLabel = event.jid.split('@')[0];
      target = {
        type: 'person',
        jid: event.jid,
        label: numericLabel,
        source: 'directory'
      };
    }

    for (const automation of automations) {
      try {
        console.log(`[Automation] Dispatching automation="${automation.id}" type="${event.type}" jid="${event.jid}"`);
        
        // Execute transient message without persisting schedule
        await this.schedulerService.executeTransientMessage({
          instanceId: event.instanceId,
          name: automation.name,
          message: automation.message,
          target,
          fallbackName: automation.fallbackName
        });
      } catch (err) {
        console.error(`[Automation] Execution failed for automation="${automation.id}":`, err);
      }
    }
  }
}
