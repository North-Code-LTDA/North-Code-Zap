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
import { validateFlowStepsStructure } from './flows';

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

  public inspectBackup(buffer: Buffer, targetWorkspaceId: string, targetUserId: string): any {
    return this.parseAndValidateBackup(buffer, targetWorkspaceId, targetUserId);
  }

  private parseAndValidateBackup(buffer: Buffer, targetWorkspaceId: string, targetUserId: string): any {
    try {
      // GZIP Output limit: 1GB
      const decompressed = zlib.gunzipSync(buffer, { maxOutputLength: 1024 * 1024 * 1024 });
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
      
      let restoreMode: 'same_workspace' | 'portable_recovery' = 'same_workspace';
      if (backup.manifest.workspaceId !== targetWorkspaceId) {
        restoreMode = 'portable_recovery';
      }
      
      const expectedScopes = ['auth', 'instances', 'contacts', 'media', 'templates', 'schedules', 'campaigns', 'automations', 'flows'];
      if (!Array.isArray(backup.manifest.scopes)) {
        throw new Error('Scopes inválido.');
      }
      const backupScopes = new Set(backup.manifest.scopes);
      for (const scope of expectedScopes) {
        if (!backupScopes.has(scope)) {
          throw new Error(`Scope ausente: ${scope}`);
        }
      }
      if (backup.manifest.scopes.length !== expectedScopes.length || backupScopes.size !== expectedScopes.length) {
        throw new Error('Scopes desconhecidos ou duplicados.');
      }

      if (!backup.data || typeof backup.data !== 'object') {
        throw new Error('Dados inválidos ou corrompidos.');
      }
      
      const enforceArray = (arr: any, name: string) => {
        if (!Array.isArray(arr)) throw new Error(`${name} deve ser um array.`);
      };

      enforceArray(backup.data.auth?.workspaces, 'auth.workspaces');
      if (backup.data.auth.workspaces.length !== 1 || backup.data.auth.workspaces[0].id !== backup.manifest.workspaceId) {
        throw new Error('Backup com metadata de workspace inválida ou estrangeira.');
      }
      enforceArray(backup.data.auth?.users, 'auth.users');
      enforceArray(backup.data.auth?.sessions, 'auth.sessions');
      enforceArray(backup.data.instances, 'instances');
      enforceArray(backup.data.templates, 'templates');
      enforceArray(backup.data.schedules, 'schedules');
      enforceArray(backup.data.campaigns, 'campaigns');
      enforceArray(backup.data.campaignHistory, 'campaignHistory');
      enforceArray(backup.data.automations, 'automations');
      enforceArray(backup.data.flows, 'flows');
      enforceArray(backup.data.flowExecutions, 'flowExecutions');
      enforceArray(backup.files, 'files');

      // UUID and uniqueness
      const isUUID = (str: string) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
      const wsId = backup.manifest.workspaceId;
      if (!isUUID(wsId)) throw new Error('Workspace ID inválido no manifest.');

      // Strict Array & Scopes check
      if (backup.manifest.scopes.length !== 9 || new Set(backup.manifest.scopes).size !== 9) {
         throw new Error('Manifest scopes array length must be 9 and unique.');
      }
      if (backup.data.auth.workspaces.length !== 1 || backup.data.auth.workspaces[0].id !== wsId) {
         throw new Error('auth.workspaces must contain exactly 1 workspace corresponding to the backup manifest.');
      }
      
      if (restoreMode === 'portable_recovery') {
        if (backup.data.auth.users.length !== 1) {
          throw new Error('Portable Recovery V1 só pode ser aceito se existir exatamente 1 user no backup.');
        }
      }
      
      const ALL_USERS_FILE = path.join(DATA_DIR, 'auth', 'users.json');
      let globalUsers = [];
      if (fs.existsSync(ALL_USERS_FILE)) {
         globalUsers = JSON.parse(fs.readFileSync(ALL_USERS_FILE, 'utf-8'));
      }
      const backupEmailSet = new Set<string>();
      
      if (restoreMode === 'portable_recovery') {
        const currentUser = globalUsers.find(x => x.id === targetUserId);
        if (!currentUser) throw new Error('Portable Recovery exige o usuário autenticado atual.');
        const targetEmail = currentUser.email.trim().toLowerCase();
        const backupEmail = backup.data.auth.users[0].email.trim().toLowerCase();
        if (targetEmail !== backupEmail) {
          throw new Error('Portable Recovery exige o mesmo e-mail da conta do backup.');
        }
      }

      for (const u of backup.data.auth.users) {
        if (!isUUID(u.id) || u.workspaceId !== wsId || typeof u.name !== 'string' || u.name.trim() === '') throw new Error('User field inválido');
        if (typeof u.email !== 'string') throw new Error('User email inválido');
        const normEmail = u.email.trim().toLowerCase();
        if (!normEmail || !/^\S+@\S+\.\S+$/.test(normEmail)) throw new Error('User email inválido');
        
        if (typeof u.passwordSalt !== 'string' || !u.passwordSalt.trim() || typeof u.passwordHash !== 'string' || !u.passwordHash.trim()) throw new Error('User password field inválido');
        const isValidDateString = (d: any) => typeof d === 'string' && !isNaN(new Date(d).getTime());
        if (!isValidDateString(u.createdAt) || !isValidDateString(u.updatedAt)) throw new Error('User dates inválidas');
        
        u.email = normEmail;
        if (backupEmailSet.has(normEmail)) throw new Error('Email duplicado no backup');
        backupEmailSet.add(normEmail);

        const existingId = globalUsers.find(x => x.id === u.id);
        if (existingId && existingId.workspaceId !== targetWorkspaceId) throw new Error('Colisão de usuário com outro workspace.');
        const existingEmail = globalUsers.find(x => x.email.trim().toLowerCase() === normEmail);
        if (existingEmail && existingEmail.workspaceId !== targetWorkspaceId) throw new Error('Colisão de e-mail de usuário com outro workspace.');
      }
      
      const ALL_SESSIONS_FILE = path.join(DATA_DIR, 'auth', 'sessions.json');
      let globalSessions = [];
      if (fs.existsSync(ALL_SESSIONS_FILE)) {
         globalSessions = JSON.parse(fs.readFileSync(ALL_SESSIONS_FILE, 'utf-8'));
      }
      
      const backupSessionIds = new Set<string>();
      const backupTokenHashes = new Set<string>();
      
      for (const s of backup.data.auth.sessions) {
         if (!isUUID(s.id) || !isUUID(s.userId)) throw new Error('Session ID ou userId inválido');
         if (typeof s.tokenHash !== 'string' || s.tokenHash.trim() === '') throw new Error('Session tokenHash inválido');
         const isValidDateString = (d: any) => typeof d === 'string' && !isNaN(new Date(d).getTime());
         if (!isValidDateString(s.createdAt) || !isValidDateString(s.expiresAt)) throw new Error('Session dates inválidas');
         
         if (backupSessionIds.has(s.id)) throw new Error('Session ID duplicado no backup');
         backupSessionIds.add(s.id);
         
         if (backupTokenHashes.has(s.tokenHash)) throw new Error('Session tokenHash duplicado no backup');
         backupTokenHashes.add(s.tokenHash);

         const existingSession = globalSessions.find(x => x.id === s.id);
         if (existingSession) {
            const eu = globalUsers.find(x => x.id === existingSession.userId);
            if (eu && eu.workspaceId !== targetWorkspaceId) throw new Error('Colisão de sessão com outro workspace.');
         }
         const existingHash = globalSessions.find(x => x.tokenHash === s.tokenHash);
         if (existingHash) {
            const eu = globalUsers.find(x => x.id === existingHash.userId);
            if (eu && eu.workspaceId !== targetWorkspaceId) throw new Error('Colisão de sessão com outro workspace.');
         }
      }

      // Check structures of flows and flowExecutions
      for (const f of backup.data.flows) {
        if (!f || typeof f !== 'object') throw new Error('Flow is not an object');
        if (!isUUID(f.id) || !isUUID(f.workspaceId) || !isUUID(f.instanceId)) throw new Error('Flow UUIDs inválidos');
        if (f.workspaceId !== wsId) throw new Error('Flow workspaceId incorreto');
        if (typeof f.name !== 'string' || f.name.trim() === '') throw new Error('Flow name inválido');
        if (typeof f.enabled !== 'boolean') throw new Error('Flow enabled inválido');
        const isValidDateString = (d: any) => typeof d === 'string' && !isNaN(new Date(d).getTime());
        if (!isValidDateString(f.createdAt) || !isValidDateString(f.updatedAt)) throw new Error('Flow dates inválidas');
        
        if (!f.trigger || typeof f.trigger !== 'object') throw new Error('Flow sem trigger struct');
        if (f.trigger.type === 'contact_added_to_list') {
           if (!isUUID(f.trigger.listId)) throw new Error('Flow trigger listId inválido');
        } else if (f.trigger.type === 'tag_added_to_contact') {
           if (!isUUID(f.trigger.tagId)) throw new Error('Flow trigger tagId inválido');
        } else {
           throw new Error('Flow trigger type inválido');
        }
        
        if (!Array.isArray(f.steps) || f.steps.length < 1) throw new Error('Flow steps array inválido');
        validateFlowStepsStructure(f.steps);
      }
      for (const e of backup.data.flowExecutions) {
        if (!e || typeof e !== 'object') throw new Error('FlowExecution is not an object');
        if (!isUUID(e.id) || !isUUID(e.workspaceId) || !isUUID(e.instanceId) || !isUUID(e.flowId)) throw new Error('FlowExecution com id UUID inválido');
        if (typeof e.flowName !== 'string' || e.flowName.trim() === '') throw new Error('FlowExecution flowName incorreta');
        if (typeof e.jid !== 'string' || e.jid.trim() === '' || !e.jid.endsWith('@s.whatsapp.net')) throw new Error('FlowExecution jid incorreta');
        if (e.status !== 'waiting' && e.status !== 'running') throw new Error('FlowExecution status incorreto');
        const isValidDateString = (d: any) => typeof d === 'string' && !isNaN(new Date(d).getTime());
        if (!isValidDateString(e.createdAt) || !isValidDateString(e.updatedAt)) throw new Error('FlowExecution dates inválidas');
        
        if (e.status === 'waiting' && !isValidDateString(e.resumeAt)) throw new Error('FlowExecution resumeAt inválido');
        if (e.status === 'running' && e.resumeAt !== null) throw new Error('FlowExecution resumeAt não null em running');
        
        if (!Array.isArray(e.remainingSteps)) throw new Error('FlowExecution remainingSteps inválido');
        if (e.remainingSteps.length > 0) {
          validateFlowStepsStructure(e.remainingSteps);
        }
      }


      const userIds = new Set<string>();
      for (const u of backup.data.auth.users) {
        if (u.workspaceId !== wsId) throw new Error('User com workspaceId incompatível.');
        if (!isUUID(u.id)) throw new Error('User ID inválido.');
        if (userIds.has(u.id)) throw new Error('User ID duplicado.');
        userIds.add(u.id);
      }

      for (const s of backup.data.auth.sessions) {
        if (!isUUID(s.id)) throw new Error('Session ID inválido.');
        if (!userIds.has(s.userId)) throw new Error('Session de usuário desconhecido.');
      }

      const instanceIds = new Set<string>();
      for (const i of backup.data.instances) {
        if (i.workspaceId !== wsId) throw new Error('Instance com workspaceId incompatível.');
        if (!isUUID(i.id)) throw new Error('Instance ID inválido.');
        if (instanceIds.has(i.id)) throw new Error('Instance ID duplicado.');
        instanceIds.add(i.id);
      }

      const templateIds = new Set<string>();
      for (const t of backup.data.templates) {
        if (t.workspaceId !== wsId) throw new Error('Template com workspaceId incompatível.');
        if (!isUUID(t.id)) throw new Error('Template ID inválido.');
        if (templateIds.has(t.id)) throw new Error('Template ID duplicado.');
        templateIds.add(t.id);
      }
      
      const campaignIds = new Set<string>();
      for (const c of backup.data.campaigns) {
        if (c.workspaceId !== wsId) throw new Error('Campaign com workspaceId incompatível.');
        if (!isUUID(c.id)) throw new Error('Campaign ID inválido.');
        if (campaignIds.has(c.id)) throw new Error('Campaign ID duplicado.');
        if (!instanceIds.has(c.instanceId)) throw new Error('Campaign aponta para instance ausente.');
        campaignIds.add(c.id);
      }

      for (const h of backup.data.campaignHistory) {
        if (h.workspaceId !== wsId) throw new Error('CampaignHistory com workspaceId incompatível.');
        if (!isUUID(h.id)) throw new Error('CampaignHistory ID inválido.');
      }

      const automationIds = new Set<string>();
      for (const a of backup.data.automations) {
        if (a.workspaceId !== wsId) throw new Error('Automation com workspaceId incompatível.');
        if (!isUUID(a.id)) throw new Error('Automation ID inválido.');
        if (automationIds.has(a.id)) throw new Error('Automation ID duplicado.');
        if (!instanceIds.has(a.instanceId)) throw new Error('Automation aponta para instance ausente.');
        automationIds.add(a.id);
      }

      const flowIds = new Set<string>();
      for (const f of backup.data.flows) {
        if (f.workspaceId !== wsId) throw new Error('Flow com workspaceId incompatível.');
        if (!isUUID(f.id)) throw new Error('Flow ID inválido.');
        if (flowIds.has(f.id)) throw new Error('Flow ID duplicado.');
        if (!instanceIds.has(f.instanceId)) throw new Error('Flow aponta para instance ausente.');
        flowIds.add(f.id);
      }
      
      const executionIds = new Set<string>();
      for (const e of backup.data.flowExecutions) {
        if (e.workspaceId !== wsId) throw new Error('FlowExecution com workspaceId incompatível.');
        if (!isUUID(e.id)) throw new Error('FlowExecution ID inválido.');
        if (executionIds.has(e.id)) throw new Error('FlowExecution ID duplicado.');
        if (!instanceIds.has(e.instanceId)) throw new Error('FlowExecution aponta para instance ausente.');
        if (!flowIds.has(e.flowId)) throw new Error('FlowExecution aponta para flow ausente.');
        executionIds.add(e.id);
      }

      const scheduleIds = new Set<string>();
      for (const s of backup.data.schedules) {
        if (!this.schedulerService.validatePersistedSchedule(s)) {
           throw new Error(`Schedule inválido: ${s?.id || 'unknown'}`);
        }
        if (typeof s.id !== 'string' || s.id.trim() === '') throw new Error('Schedule ID inválido.');
        if (scheduleIds.has(s.id)) throw new Error('Schedule ID duplicado.');
        if (!instanceIds.has(s.instanceId)) throw new Error('Schedule aponta para instance ausente.');
        scheduleIds.add(s.id);
      }

      for (const c of backup.data.campaigns) {
        if (c.scheduleId && !scheduleIds.has(c.scheduleId)) {
          throw new Error('Campaign aponta para schedule ausente.');
        }
        if (c.scheduleId) {
          const sched = backup.data.schedules.find((s: any) => s.id === c.scheduleId);
          if (sched && sched.instanceId !== c.instanceId) {
            throw new Error('Campaign e Schedule apontam para instances diferentes.');
          }
        }
      }

      // Check instances collision
      const INSTANCES_FILE = path.join(DATA_DIR, 'instances.json');
      if (fs.existsSync(INSTANCES_FILE)) {
        try {
          const currentInstances = JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf-8'));
          if (Array.isArray(currentInstances)) {
            for (const ci of currentInstances) {
              if (instanceIds.has(ci.id) && ci.workspaceId !== targetWorkspaceId) {
                throw new Error(`Colisão: A instância ${ci.id} já existe e pertence a outro workspace.`);
              }
            }
          }
        } catch (e: any) {
          if (e.message.includes('Colisão')) throw e;
          // Ignore parse error here, updateGlobalJson will throw
        }
      }

      // Validate files
      const fileKeys = new Set<string>();
      const instancesRoot = path.resolve(DATA_DIR, 'instances');
      for (const file of backup.files) {
        if (file.relativePath.includes('\0')) {
          throw new Error('Null byte detectado.');
        }
        if (!instanceIds.has(file.instanceId)) {
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
        
        const instanceRoot = path.resolve(instancesRoot, file.instanceId);
        const candidate = path.resolve(instanceRoot, file.relativePath);
        if (!this.isPathInside(instancesRoot, instanceRoot) || !this.isPathInside(instanceRoot, candidate)) {
          throw new Error('Caminho de arquivo perigoso bloqueado antes da mutação.');
        }

        const key = `${file.instanceId}::${file.relativePath}`;
        if (fileKeys.has(key)) {
          throw new Error(`Arquivo duplicado no backup: ${file.relativePath}`);
        }
        fileKeys.add(key);

        // Strict base64 validation
        if (typeof file.content !== 'string') throw new Error('Conteúdo do arquivo não é string.');
        const decoded = Buffer.from(file.content, 'base64');
        const reencoded = decoded.toString('base64');
        if (reencoded !== file.content) {
          throw new Error(`Base64 inválido para o arquivo: ${file.relativePath}`);
        }
      }

      // Check media references
      const checkMediaRef = (media: any, instanceId: string, context: string) => {
        if (media?.source === 'upload' && media.localPath) {
          const safeFilename = path.basename(media.localPath);
          const expectedRelativePath = `media/${safeFilename}`;
          if (!fileKeys.has(`${instanceId}::${expectedRelativePath}`)) {
            throw new Error(`Mídia da ${context} não encontrada no backup: ${safeFilename}`);
          }
        }
      };

      for (const s of backup.data.schedules) checkMediaRef(s.media, s.instanceId, 'agendamento');
      for (const c of backup.data.campaigns) checkMediaRef(c.media, c.instanceId, 'campanha');

      // Cross references Audience
      const instanceAudiences = new Map<string, any>();
      for (const file of backup.files) {
        if (file.relativePath === 'recipients/contacts.json') {
          let parsed;
          try {
            const jsonStr = Buffer.from(file.content, 'base64').toString('utf-8');
            parsed = JSON.parse(jsonStr);
          } catch (e) {
            throw new Error(`contacts.json inválido para a instância ${file.instanceId}`);
          }
          if (!Array.isArray(parsed)) {
            throw new Error(`contacts.json inválido para a instância ${file.instanceId}`);
          }
        }
        if (file.relativePath === 'recipients/audiences.json') {
          try {
            const jsonStr = Buffer.from(file.content, 'base64').toString('utf-8');
            instanceAudiences.set(file.instanceId, JSON.parse(jsonStr));
          } catch(e) {
            throw new Error(`Falha ao decodificar recipients/audiences.json de ${file.instanceId}`);
          }
        }
      }

      for (const instId of instanceIds) {
        const aud = instanceAudiences.get(instId) || { tags: [], lists: [] };
        const validTagIds = new Set(Array.isArray(aud.tags) ? aud.tags.map((t: any) => t.id) : []);
        const validListIds = new Set(Array.isArray(aud.lists) ? aud.lists.map((l: any) => l.id) : []);

        const checkStep = (step: any) => {
          if (step.type === 'add_tag' || step.type === 'remove_tag') {
            if (!validTagIds.has(step.tagId)) throw new Error('Step referencia tag ausente.');
          }
          if (step.type === 'add_to_list' || step.type === 'remove_from_list') {
            if (!validListIds.has(step.listId)) throw new Error('Step referencia list ausente.');
          }
          if (step.type === 'condition') {
             if (step.condition?.type === 'has_tag' && !validTagIds.has(step.condition.tagId)) {
                throw new Error('Condition referencia tag ausente.');
             }
             if (step.condition?.type === 'in_list' && !validListIds.has(step.condition.listId)) {
                throw new Error('Condition referencia list ausente.');
             }
             for (const s of step.ifTrue || []) checkStep(s);
             for (const s of step.ifFalse || []) checkStep(s);
          }
        };

        for (const f of backup.data.flows) {
          if (f.instanceId === instId) {
            if (f.trigger?.type === 'contact_added_to_list' && !validListIds.has(f.trigger.listId)) {
              throw new Error('Flow trigger referencia list ausente.');
            }
            if (f.trigger?.type === 'tag_added_to_contact' && !validTagIds.has(f.trigger.tagId)) {
              throw new Error('Flow trigger referencia tag ausente.');
            }
            for (const step of f.steps || []) {
              checkStep(step);
            }
          }
        }

        for (const a of backup.data.automations) {
          if (a.instanceId === instId) {
            if (a.trigger?.type === 'contact_added_to_list' && !validListIds.has(a.trigger.listId)) {
              throw new Error('Automation trigger referencia list ausente.');
            }
            if (a.trigger?.type === 'tag_added_to_contact' && !validTagIds.has(a.trigger.tagId)) {
              throw new Error('Automation trigger referencia tag ausente.');
            }
          }
        }
      }

      const counts = {
        users: backup.data.auth.users.length,
        instances: backup.data.instances.length,
        templates: backup.data.templates.length,
        schedules: backup.data.schedules.length,
        campaigns: backup.data.campaigns.length,
        campaignHistory: backup.data.campaignHistory.length,
        automations: backup.data.automations.length,
        flows: backup.data.flows.length,
        flowExecutions: backup.data.flowExecutions.length,
        files: backup.files.length
      };

      const warnings = [];
      if (restoreMode === 'portable_recovery') {
        warnings.push("Este backup pertence a uma instalação anterior. Os dados serão restaurados no workspace atual e o login atual será preservado.");
      } else {
        warnings.push("Este backup restaurará credenciais e sessões da conta.");
      }
      warnings.push("As conexões WhatsApp serão reiniciadas usando as credenciais restauradas.");

      const activeSchedules = backup.data.schedules.filter((s: any) => s.status === 'active');
      if (activeSchedules.length > 0) warnings.push(`Existem ${activeSchedules.length} agendamentos ativos neste backup.`);

      const overdueOnce = activeSchedules.filter((s: any) => s.scheduleType === 'once' && new Date(s.nextRunAt).getTime() < Date.now());
      if (overdueOnce.length > 0) warnings.push(`Existem ${overdueOnce.length} agendamentos once vencidos.`);

      const waitingFlows = backup.data.flowExecutions.filter((f: any) => f.status === 'waiting');
      if (waitingFlows.length > 0) warnings.push(`Existem ${waitingFlows.length} Flow Executions aguardando continuação.`);

      const overdueFlows = waitingFlows.filter((f: any) => f.resumeAt && new Date(f.resumeAt).getTime() < Date.now());
      if (overdueFlows.length > 0) warnings.push(`Existem ${overdueFlows.length} Flow Executions cujo tempo de espera já venceu.`);

      const runningFlows = backup.data.flowExecutions.filter((f: any) => f.status === 'running');
      if (runningFlows.length > 0) warnings.push("Executions salvas como running serão descartadas conforme a regra de startup.");

      let workingBackup = backup;
      if (restoreMode === 'portable_recovery') {
        workingBackup = JSON.parse(JSON.stringify(backup));
        workingBackup.manifest.workspaceId = targetWorkspaceId;
        
        for (const i of workingBackup.data.instances) i.workspaceId = targetWorkspaceId;
        for (const t of workingBackup.data.templates) t.workspaceId = targetWorkspaceId;
        for (const c of workingBackup.data.campaigns) c.workspaceId = targetWorkspaceId;
        for (const h of workingBackup.data.campaignHistory) h.workspaceId = targetWorkspaceId;
        for (const a of workingBackup.data.automations) a.workspaceId = targetWorkspaceId;
        for (const f of workingBackup.data.flows) f.workspaceId = targetWorkspaceId;
        for (const e of workingBackup.data.flowExecutions) e.workspaceId = targetWorkspaceId;
      }

      return {
        valid: true,
        restoreMode,
        manifest: workingBackup.manifest,
        counts,
        warnings,
        backupObj: workingBackup
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
      } catch (e) {
        throw new Error(`Arquivo JSON global corrompido: ${filePath}`);
      }
    }
    const retainedData = currentData.filter((item: any) => !filterFn(item));
    const mergedData = [...retainedData, ...newData];
    
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath + '.tmp', JSON.stringify(mergedData, null, 2), { mode: 0o600 });
    fs.renameSync(filePath + '.tmp', filePath);
  }

  public async restoreBackup(workspaceId: string, userId: string, buffer: Buffer): Promise<any> {
    if (this.isRestoring(workspaceId)) {
      throw new Error('Restauração já em andamento (Lock Ativo).');
    }

    const inspected = this.parseAndValidateBackup(buffer, workspaceId, userId);
    const backup = inspected.backupObj;

    this.restoringWorkspaces.add(workspaceId);

    let safetyBackupBuffer: Buffer | null = null;
    let mutationStarted = false;
    
    let preRestoreInstanceIds = new Set<string>();
    let preRestoreWorkspaceUserIds = new Set<string>();
    let targetRestoreInstanceIds = new Set<string>();
    let targetRestoreUserIds = new Set<string>();

    try {
      this.schedulerService.suspendWorkspace(workspaceId);
      this.flowRunner.suspendWorkspace(workspaceId);
      this.automationRunner.suspendWorkspace(workspaceId);

      // Recheck busy
      if (this.schedulerService.isWorkspaceBusy(workspaceId)) throw new Error('Há um agendamento em execução. Aguarde a conclusão antes de restaurar o backup.');
      if (this.flowRunner.isWorkspaceBusy(workspaceId)) throw new Error('Há um fluxo em execução. Aguarde a conclusão antes de restaurar o backup.');
      if (this.automationRunner.isWorkspaceBusy(workspaceId)) throw new Error('Há uma automação em execução. Aguarde a conclusão antes de restaurar o backup.');

      this.instanceManager.flushWorkspaceForRestore(workspaceId);

      safetyBackupBuffer = backupService.exportBackup({
        workspaceId,
        userId,
        mode: 'full',
        scopes: backup.manifest.scopes
      });

      // Capture pre-restore state
      try {
        const INSTANCES_FILE = path.join(DATA_DIR, 'instances.json');
        if (fs.existsSync(INSTANCES_FILE)) {
          const currentInstances = JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf-8'));
          for (const i of currentInstances) {
            if (i.workspaceId === workspaceId) preRestoreInstanceIds.add(i.id);
          }
        }
        const USERS_FILE = path.join(DATA_DIR, 'auth', 'users.json');
        if (fs.existsSync(USERS_FILE)) {
          const currentUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
          for (const u of currentUsers) {
            if (u.workspaceId === workspaceId) preRestoreWorkspaceUserIds.add(u.id);
          }
        }
      } catch (e) {
        throw new Error('Falha ao capturar estado atual do workspace.');
      }

      this.instanceManager.suspendWorkspaceForRestore(workspaceId);
      mutationStarted = true;

      const restoredInstanceIds = new Set<string>(backup.data.instances.map((i: any) => i.id));
      targetRestoreInstanceIds = restoredInstanceIds;
      targetRestoreUserIds = new Set<string>(backup.data.auth.users.map((u: any) => u.id));
      targetRestoreInstanceIds = restoredInstanceIds;
      targetRestoreUserIds = new Set<string>(backup.data.auth.users.map((u: any) => u.id));

      if (inspected.restoreMode !== 'portable_recovery') {
        this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'workspaces.json'), workspaceId, backup.data.auth.workspaces, (w) => w.id === workspaceId);
        this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'users.json'), workspaceId, backup.data.auth.users, (u) => u.workspaceId === workspaceId);
        this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'sessions.json'), workspaceId, backup.data.auth.sessions, (s: any) => preRestoreWorkspaceUserIds.has(s.userId));
      }
      
      this.updateGlobalJson(path.join(DATA_DIR, 'instances.json'), workspaceId, backup.data.instances, (i) => i.workspaceId === workspaceId);

      const instancesRoot = path.join(DATA_DIR, 'instances');
      
      // Clean up old instance directories of the workspace not in the backup
      for (const oldId of preRestoreInstanceIds) {
        if (!restoredInstanceIds.has(oldId)) {
          const instanceRoot = path.join(instancesRoot, oldId);
          if (this.isPathInside(instancesRoot, instanceRoot) && fs.existsSync(instanceRoot)) {
            fs.rmSync(instanceRoot, { recursive: true, force: true });
          }
        }
      }

      // Recreate instance directories for restored instances
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

      for (const file of backup.files) {
        const instanceRoot = path.join(instancesRoot, file.instanceId);
        const filePath = path.resolve(instanceRoot, file.relativePath);
        if (!this.isPathInside(instanceRoot, filePath)) {
          throw new Error('Caminho de arquivo perigoso bloqueado.');
        }
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, Buffer.from(file.content, 'base64'));
      }

      this.updateGlobalJson(path.join(DATA_DIR, 'templates', 'templates.json'), workspaceId, backup.data.templates, (t) => t.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'campaigns', 'campaigns.json'), workspaceId, backup.data.campaigns, (c) => c.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'history', 'executions.json'), workspaceId, backup.data.campaignHistory, (h) => h.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'automations', 'automations.json'), workspaceId, backup.data.automations, (a) => a.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'flows', 'flows.json'), workspaceId, backup.data.flows, (f) => f.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'flows', 'executions.json'), workspaceId, backup.data.flowExecutions, (e) => e.workspaceId === workspaceId);

      for (const schedule of backup.data.schedules) {
        if (schedule.media?.source === 'upload' && schedule.media.localPath) {
          const safeFilename = path.basename(schedule.media.localPath);
          schedule.media.localPath = path.join(instancesRoot, schedule.instanceId, 'media', safeFilename);
        }
      }
      this.updateGlobalJson(path.join(DATA_DIR, 'scheduler', 'schedules.json'), workspaceId, backup.data.schedules, (s) => {
        return preRestoreInstanceIds.has(s.instanceId) || restoredInstanceIds.has(s.instanceId);
      });

      for (const c of backup.data.campaigns) {
        if (c.media?.source === 'upload' && c.media.localPath) {
          const safeFilename = path.basename(c.media.localPath);
          c.media.localPath = path.join(instancesRoot, c.instanceId, 'media', safeFilename);
        }
      }
      this.updateGlobalJson(path.join(DATA_DIR, 'campaigns', 'campaigns.json'), workspaceId, backup.data.campaigns, (c) => c.workspaceId === workspaceId);

      authService.init();
      await this.instanceManager.reloadWorkspaceFromDisk(workspaceId);
      templateService.init();
      campaignService.init();
      campaignHistoryService.init();
      automationService.init();
      this.flowService.init();
      
      const affectedInstanceIds = new Set([...preRestoreInstanceIds, ...restoredInstanceIds]);
      this.schedulerService.reloadWorkspaceFromDisk(workspaceId, affectedInstanceIds);
      this.flowRunner.reloadWorkspaceFromDisk(workspaceId);

      return {
        success: true,
        message: 'Backup restaurado com sucesso.',
        restored: inspected.counts
      };

    } catch (err: any) {
      console.error('[Restore] Failure:', err);
      if (mutationStarted && safetyBackupBuffer) {
           let rollbackSucceeded = false;
           try {
             await this.performRollback(workspaceId, safetyBackupBuffer, preRestoreInstanceIds, preRestoreWorkspaceUserIds, targetRestoreInstanceIds, targetRestoreUserIds);
             rollbackSucceeded = true;
           } catch (rollbackErr: any) {
             console.error('[Restore] CRITICAL rollback failure:', rollbackErr);
             throw new Error('Falha crítica de rollback. Erro original: ' + err.message);
           }
           if (rollbackSucceeded) {
             throw new Error('Restore falhou. Rollback executado com sucesso. Erro original: ' + err.message);
           }
      } else {
         throw new Error('Restore falhou: ' + err.message);
      }
    } finally {
      this.schedulerService.resumeWorkspace(workspaceId);
      this.flowRunner.resumeWorkspace(workspaceId);
      this.automationRunner.resumeWorkspace(workspaceId);
      this.restoringWorkspaces.delete(workspaceId);
    }
  }

  private async performRollback(workspaceId: string, buffer: Buffer, preRestoreInstanceIds: Set<string>, preRestoreWorkspaceUserIds: Set<string>, targetRestoreInstanceIds: Set<string>, targetRestoreUserIds: Set<string>) {
      // Suspend newly reloaded runtimes just in case
      this.instanceManager.suspendWorkspaceForRestore(workspaceId);

      const decompressed = zlib.gunzipSync(buffer, { maxOutputLength: 1024 * 1024 * 1024 });
      const backupStr = decompressed.toString('utf-8');
      const backup = JSON.parse(backupStr);

      const restoredInstanceIds = new Set<string>(backup.data.instances.map((i: any) => i.id));
      const backupUserIds = new Set<string>(backup.data.auth.users.map((u: any) => u.id));
      
      // Cleanup extra directories not in the safety backup
      const instancesRoot = path.join(DATA_DIR, 'instances');
      const currentInstancesFile = path.join(DATA_DIR, 'instances.json');
      if (fs.existsSync(currentInstancesFile)) {
           const currentInstances = JSON.parse(fs.readFileSync(currentInstancesFile, 'utf-8'));
           for (const i of currentInstances) {
              if (i.workspaceId === workspaceId && !restoredInstanceIds.has(i.id)) {
                 const instanceRoot = path.join(instancesRoot, i.id);
                 if (this.isPathInside(instancesRoot, instanceRoot) && fs.existsSync(instanceRoot)) {
                   fs.rmSync(instanceRoot, { recursive: true, force: true });
                 }
              }
           }
           // Also clear target restore directories if they aren't in the safety backup
           for (const tId of targetRestoreInstanceIds) {
             if (!restoredInstanceIds.has(tId)) {
               const instanceRoot = path.join(instancesRoot, tId);
               if (this.isPathInside(instancesRoot, instanceRoot) && fs.existsSync(instanceRoot)) {
                 fs.rmSync(instanceRoot, { recursive: true, force: true });
               }
             }
           }
      }

      const allUserIdsToClear = new Set([...preRestoreWorkspaceUserIds, ...targetRestoreUserIds, ...backupUserIds]);
      const allInstanceIdsToClear = new Set([...preRestoreInstanceIds, ...targetRestoreInstanceIds, ...restoredInstanceIds]);

      this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'workspaces.json'), workspaceId, backup.data.auth.workspaces || [], (w) => w.id === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'users.json'), workspaceId, backup.data.auth.users || [], (u) => u.workspaceId === workspaceId);
      this.updateGlobalJson(path.join(DATA_DIR, 'auth', 'sessions.json'), workspaceId, backup.data.auth.sessions || [], (s: any) => allUserIdsToClear.has(s.userId));
      
      this.updateGlobalJson(path.join(DATA_DIR, 'instances.json'), workspaceId, backup.data.instances || [], (i) => i.workspaceId === workspaceId);

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
      this.updateGlobalJson(path.join(DATA_DIR, 'scheduler', 'schedules.json'), workspaceId, backup.data.schedules || [], (s) => allInstanceIdsToClear.has(s.instanceId));

      authService.init();
      await this.instanceManager.reloadWorkspaceFromDisk(workspaceId);
      templateService.init();
      campaignService.init();
      campaignHistoryService.init();
      automationService.init();
      this.flowService.init();
      
      this.schedulerService.reloadWorkspaceFromDisk(workspaceId, allInstanceIdsToClear);
      this.flowRunner.reloadWorkspaceFromDisk(workspaceId);
  }
}
