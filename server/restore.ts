import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';

import { authService } from './auth';
import { DATA_DIR, InstanceManager } from './instances';
import { SchedulerService } from './scheduler';
import { FlowRunner } from './flow-runner';
import { AutomationRunner } from './automation-runner';
import { backupService } from './backup';
import { campaignService } from './campaigns';
import { campaignHistoryService } from './campaign-history';
import { templateService } from './templates';
import { automationService } from './automations';
// flowService passed via constructor

export class RestoreService {
  private restoringWorkspaces = new Set<string>();

  constructor(
    private instanceManager: InstanceManager,
    private schedulerService: SchedulerService,
    private flowRunner: FlowRunner,
    private automationRunner: AutomationRunner,
    private flowService: any
  ) {}

  public isRestoring(workspaceId: string) {
    return this.restoringWorkspaces.has(workspaceId);
  }

  public inspectBackup(buffer: Buffer): any {
    try {
      const decompressed = zlib.gunzipSync(buffer);
      const backupStr = decompressed.toString('utf-8');
      const backup = JSON.parse(backupStr);

      if (!backup.manifest || backup.manifest.format !== 'north-code-zap-backup') {
        throw new Error('Formato de arquivo inválido.');
      }
      if (backup.manifest.version !== 1) {
        throw new Error('Versão do backup não suportada.');
      }
      if (backup.manifest.mode !== 'full') {
        throw new Error('O Restore V1 aceita apenas backups completos.');
      }
      
      const expectedScopes = ['auth', 'instances', 'contacts', 'media', 'templates', 'schedules', 'campaigns', 'automations', 'flows'];
      for (const scope of expectedScopes) {
        if (!backup.manifest.scopes.includes(scope)) {
          throw new Error(`Scope ausente: ${scope}`);
        }
      }

      if (!backup.data || !backup.data.auth) {
        throw new Error('Dados inválidos ou corrompidos.');
      }

      const counts = {
        users: backup.data.auth.users?.length || 0,
        instances: backup.data.instances?.length || 0,
        templates: backup.data.templates?.length || 0,
        schedules: backup.data.schedules?.length || 0,
        campaigns: backup.data.campaigns?.length || 0,
        campaignHistory: backup.data.campaignHistory?.length || 0,
        automations: backup.data.automations?.length || 0,
        flows: backup.data.flows?.length || 0,
        flowExecutions: backup.data.flowExecutions?.length || 0,
        files: backup.files?.length || 0
      };

      const warnings = [
        "Este backup restaurará credenciais e sessões da conta.",
        "As conexões WhatsApp serão reiniciadas usando as credenciais restauradas.",
      ];

      const activeSchedules = backup.data.schedules?.filter((s: any) => s.status === 'active') || [];
      if (activeSchedules.length > 0) warnings.push(`Existem ${activeSchedules.length} agendamentos ativos neste backup.`);

      const overdueOnce = activeSchedules.filter((s: any) => s.scheduleType === 'once' && new Date(s.nextRunAt).getTime() < Date.now());
      if (overdueOnce.length > 0) warnings.push(`Existem ${overdueOnce.length} agendamentos once vencidos.`);

      const waitingFlows = backup.data.flowExecutions?.filter((f: any) => f.status === 'waiting') || [];
      if (waitingFlows.length > 0) warnings.push(`Existem ${waitingFlows.length} Flow Executions aguardando continuação.`);

      const overdueFlows = waitingFlows.filter((f: any) => f.resumeAt && new Date(f.resumeAt).getTime() < Date.now());
      if (overdueFlows.length > 0) warnings.push(`Existem ${overdueFlows.length} Flow Executions cujo tempo de espera já venceu.`);

      const runningFlows = backup.data.flowExecutions?.filter((f: any) => f.status === 'running') || [];
      if (runningFlows.length > 0) warnings.push("Executions salvas como running serão tratadas como interrompidas conforme a regra de startup.");

      return {
        valid: true,
        manifest: backup.manifest,
        counts,
        warnings,
        backupObj: backup
      };

    } catch (err: any) {
      throw new Error(`Inspeção falhou: ${err.message}`);
    }
  }

  private isPathInside(root: string, candidate: string): boolean {
    const resolvedRoot = path.resolve(root);
    const resolvedCandidate = path.resolve(candidate);
    const relative = path.relative(resolvedRoot, resolvedCandidate);
    return (
      relative === '' ||
      (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    );
  }

  private updateGlobalJson(filePath: string, workspaceId: string, newData: any[], filterFn: (item: any) => boolean) {
    let currentData = [];
    if (fs.existsSync(filePath)) {
      try {
        currentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (e) { }
    }
    const retainedData = currentData.filter((item: any) => !filterFn(item));
    const mergedData = [...retainedData, ...newData];
    
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath + '.tmp', JSON.stringify(mergedData, null, 2));
    fs.renameSync(filePath + '.tmp', filePath);
  }

  public async restoreBackup(workspaceId: string, userId: string, buffer: Buffer): Promise<any> {
    const inspected = this.inspectBackup(buffer);
    const backup = inspected.backupObj;

    if (backup.manifest.workspaceId !== workspaceId) {
      throw new Error('Este backup pertence a outro workspace e não pode ser restaurado nesta conta.');
    }

    if (this.schedulerService.isWorkspaceBusy(workspaceId)) {
      throw new Error('Há um agendamento em execução. Aguarde a conclusão antes de restaurar o backup.');
    }
    if (this.flowRunner.isWorkspaceBusy(workspaceId)) {
      throw new Error('Há um fluxo em execução. Aguarde a conclusão antes de restaurar o backup.');
    }
    if (this.automationRunner.isWorkspaceBusy(workspaceId)) {
      throw new Error('Há uma automação em execução. Aguarde a conclusão antes de restaurar o backup.');
    }

    // A. Apply lock
    this.restoringWorkspaces.add(workspaceId);

    // C. Suspend runners
    this.schedulerService.suspendWorkspace(workspaceId);
    this.flowRunner.suspendWorkspace(workspaceId);
    this.automationRunner.suspendWorkspace(workspaceId);

    // E. Flush contacts
    this.instanceManager.flushWorkspaceForRestore(workspaceId);

    // F. Generate safety backup
    const safetyBackupBuffer = backupService.exportBackup({
      workspaceId,
      userId,
      mode: 'full',
      scopes: backup.manifest.scopes
    });

    try {
      // G. Suspend runtimes
      this.instanceManager.suspendWorkspaceForRestore(workspaceId);

      // Validate base64 strings and file paths
      const restoredInstanceIds = new Set<string>(backup.data.instances.map((i: any) => i.id));
      for (const file of backup.files || []) {
        if (!restoredInstanceIds.has(file.instanceId)) {
          throw new Error('Arquivo aponta para instanceId não restaurado.');
        }
        if (file.encoding !== 'base64') {
          throw new Error('Encoding inválido.');
        }
        if (!file.relativePath || typeof file.relativePath !== 'string') {
          throw new Error('Caminho de arquivo inválido.');
        }
        if (file.relativePath.startsWith('..') || path.isAbsolute(file.relativePath)) {
          throw new Error('Caminho de arquivo perigoso bloqueado.');
        }
        if (!file.relativePath.startsWith('auth/') && !file.relativePath.startsWith('recipients/') && !file.relativePath.startsWith('media/')) {
          throw new Error('Caminho de arquivo fora dos escopos permitidos.');
        }
        // Validate base64
        Buffer.from(file.content, 'base64');
      }

      // Restore Auth
      this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'workspaces.json'), workspaceId, backup.data.auth.workspaces || [], (w) => w.id === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'users.json'), workspaceId, backup.data.auth.users || [], (u) => u.workspaceId === workspaceId);
      
      const backupUserIds = new Set(backup.data.auth.users.map((u: any) => u.id));
      this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'sessions.json'), workspaceId, backup.data.auth.sessions || [], (s: any) => backupUserIds.has(s.userId));
      
      // Restore Instances
      this.updateGlobalJson(path.join(DATA_DIR, 'instances.json'), workspaceId, backup.data.instances || [], (i) => i.workspaceId === workspaceId);

      // Restore Instance Directories
      const instancesRoot = path.join(DATA_DIR, 'instances');
      for (const instId of restoredInstanceIds) {
        const instanceRoot = path.join(instancesRoot, instId);
        if (!this.isPathInside(instancesRoot, instanceRoot)) {
          throw new Error('Instance ID inválido bloqueado: ' + instId);
        }
        ['auth', 'recipients', 'media'].forEach(d => {
          const dPath = path.join(instanceRoot, d);
          if (fs.existsSync(dPath)) {
            fs.rmSync(dPath, { recursive: true, force: true });
          }
          fs.mkdirSync(dPath, { recursive: true });
        });
      }

      // Write files
      for (const file of backup.files || []) {
        const instanceRoot = path.join(instancesRoot, file.instanceId);
        const filePath = path.resolve(instanceRoot, file.relativePath);
        if (!this.isPathInside(instanceRoot, filePath)) {
          throw new Error('Caminho de arquivo perigoso bloqueado.');
        }
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, Buffer.from(file.content, 'base64'));
      }

      // Clean up old instance directories of the workspace not in the backup
      const allInstances = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'instances.json'), 'utf-8'));
      const workspaceOldInstances = allInstances.filter((i: any) => i.workspaceId === workspaceId && !restoredInstanceIds.has(i.id));
      for (const old of workspaceOldInstances) {
        const instanceRoot = path.join(instancesRoot, old.id);
        if (this.isPathInside(instancesRoot, instanceRoot) && fs.existsSync(instanceRoot)) {
          fs.rmSync(instanceRoot, { recursive: true, force: true });
        }
      }

      // Restore other data globally
      this.updateGlobalJson(path.join(DATA_DIR, 'templates', 'templates.json'), workspaceId, backup.data.templates || [], (t) => t.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'campaigns', 'campaigns.json'), workspaceId, backup.data.campaigns || [], (c) => c.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'history', 'executions.json'), workspaceId, backup.data.campaignHistory || [], (h) => h.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'automations', 'automations.json'), workspaceId, backup.data.automations || [], (a) => a.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'flows', 'flows.json'), workspaceId, backup.data.flows || [], (f) => f.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'flows', 'executions.json'), workspaceId, backup.data.flowExecutions || [], (e) => e.workspaceId === workspaceId);

      // Scheduler local paths fix and schedule restore
      for (const schedule of backup.data.schedules || []) {
        if (schedule.media?.source === 'upload' && schedule.media.localPath) {
          const safeFilename = path.basename(schedule.media.localPath);
          const newPath = path.join(instancesRoot, schedule.instanceId, 'media', safeFilename);
          if (fs.existsSync(newPath)) {
            schedule.media.localPath = newPath;
          } else {
             throw new Error(`Mídia referenciada não encontrada no backup: ${safeFilename}`);
          }
        }
      }
      this.updateGlobalJson(path.join(DATA_DIR, 'scheduler', 'schedules.json'), workspaceId, backup.data.schedules || [], (s) => {
        const inst = this.instanceManager.get(s.instanceId);
        return inst ? inst.metadata.workspaceId === workspaceId : false;
      });

      // Campaign local paths fix
      for (const c of backup.data.campaigns || []) {
        if (c.media?.source === 'upload' && c.media.localPath) {
          const safeFilename = path.basename(c.media.localPath);
          const newPath = path.join(instancesRoot, c.instanceId, 'media', safeFilename);
          if (fs.existsSync(newPath)) {
             c.media.localPath = newPath;
          } else {
             throw new Error(`Mídia da campanha não encontrada no backup: ${safeFilename}`);
          }
        }
      }
      // Re-save campaigns with updated paths
      this.updateGlobalJson(path.join(DATA_DIR, 'campaigns', 'campaigns.json'), workspaceId, backup.data.campaigns || [], (c) => c.workspaceId === workspaceId);

      // Reload state
      authService.init();
      await this.instanceManager.reloadWorkspaceFromDisk(workspaceId);
      templateService.init();
      campaignService.init();
      campaignHistoryService.init();
      automationService.init();
      this.flowService.init();
      
      this.schedulerService.reloadWorkspaceFromDisk(workspaceId);
      this.flowRunner.reloadWorkspaceFromDisk(workspaceId);

      this.schedulerService.resumeWorkspace(workspaceId);
      this.flowRunner.resumeWorkspace(workspaceId);
      this.automationRunner.resumeWorkspace(workspaceId);
      this.restoringWorkspaces.delete(workspaceId);

      return {
        success: true,
        message: 'Backup restaurado com sucesso.',
        restored: inspected.counts
      };

    } catch (err: any) {
      console.error('[Restore] Failure, triggering rollback:', err);
      try {
        await this.performRollback(workspaceId, safetyBackupBuffer);
      } catch (rollbackErr: any) {
        console.error('[Restore] CRITICAL rollback failure:', rollbackErr);
        throw new Error('Falha crítica de rollback. ' + err.message);
      }
      throw new Error('Restore falhou. Rollback executado com sucesso. Erro original: ' + err.message);
    }
  }

  private async performRollback(workspaceId: string, buffer: Buffer) {
      const decompressed = zlib.gunzipSync(buffer);
      const backupStr = decompressed.toString('utf-8');
      const backup = JSON.parse(backupStr);

      const restoredInstanceIds = new Set<string>(backup.data.instances.map((i: any) => i.id));
      
      this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'workspaces.json'), workspaceId, backup.data.auth.workspaces || [], (w) => w.id === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'users.json'), workspaceId, backup.data.auth.users || [], (u) => u.workspaceId === workspaceId);
      
      const backupUserIds = new Set(backup.data.auth.users.map((u: any) => u.id));
      this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'sessions.json'), workspaceId, backup.data.auth.sessions || [], (s: any) => backupUserIds.has(s.userId));
      
      this.updateGlobalJson(path.join(DATA_DIR, 'instances.json'), workspaceId, backup.data.instances || [], (i) => i.workspaceId === workspaceId);

      const instancesRoot = path.join(DATA_DIR, 'instances');
      for (const instId of restoredInstanceIds) {
        const instanceRoot = path.join(instancesRoot, instId);
        if (!this.isPathInside(instancesRoot, instanceRoot)) continue;
        ['auth', 'recipients', 'media'].forEach(d => {
          const dPath = path.join(instanceRoot, d);
          if (fs.existsSync(dPath)) {
            fs.rmSync(dPath, { recursive: true, force: true });
          }
          fs.mkdirSync(dPath, { recursive: true });
        });
      }

      for (const file of backup.files || []) {
        const instanceRoot = path.join(instancesRoot, file.instanceId);
        const filePath = path.resolve(instanceRoot, file.relativePath);
        if (!this.isPathInside(instanceRoot, filePath)) continue;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, Buffer.from(file.content, 'base64'));
      }

      this.updateGlobalJson(path.join(DATA_DIR, 'templates', 'templates.json'), workspaceId, backup.data.templates || [], (t) => t.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'campaigns', 'campaigns.json'), workspaceId, backup.data.campaigns || [], (c) => c.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'history', 'executions.json'), workspaceId, backup.data.campaignHistory || [], (h) => h.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'automations', 'automations.json'), workspaceId, backup.data.automations || [], (a) => a.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'flows', 'flows.json'), workspaceId, backup.data.flows || [], (f) => f.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'flows', 'executions.json'), workspaceId, backup.data.flowExecutions || [], (e) => e.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'scheduler', 'schedules.json'), workspaceId, backup.data.schedules || [], (s) => {
        const inst = this.instanceManager.get(s.instanceId);
        return inst ? inst.metadata.workspaceId === workspaceId : false;
      });

      authService.init();
      await this.instanceManager.reloadWorkspaceFromDisk(workspaceId);
      templateService.init();
      campaignService.init();
      campaignHistoryService.init();
      automationService.init();
      this.flowService.init();
      
      this.schedulerService.reloadWorkspaceFromDisk(workspaceId);
      this.flowRunner.reloadWorkspaceFromDisk(workspaceId);

      this.schedulerService.resumeWorkspace(workspaceId);
      this.flowRunner.resumeWorkspace(workspaceId);
      this.automationRunner.resumeWorkspace(workspaceId);
      this.restoringWorkspaces.delete(workspaceId);
  }
}
