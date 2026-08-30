import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { DATA_DIR } from './instances.ts';

export type BackupMode = 'full' | 'selective';

export interface BackupOptions {
  workspaceId: string;
  userId: string;
  mode: BackupMode;
  scopes: string[];
}

export class BackupService {
  private safeReadJson(filePath: string): any {
    if (!fs.existsSync(filePath)) return null;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.warn(`[BackupService] Failed to read JSON at ${filePath}`, e);
      return null;
    }
  }

  private isPathInside(root: string, candidate: string): boolean {
    const resolvedRoot = path.resolve(root);
    const resolvedCandidate = path.resolve(candidate);
    const relative = path.relative(resolvedRoot, resolvedCandidate);
    
    return (
      relative === '' ||
      (
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      )
    );
  }

  private collectFiles(dirPath: string, allowedRoot: string, instanceId: string, filesArray: any[]) {
    const resolvedDir = path.resolve(dirPath);
    if (!this.isPathInside(allowedRoot, resolvedDir)) {
      console.warn(`[BackupService] Path boundary violation: ${resolvedDir}`);
      return;
    }

    if (!fs.existsSync(resolvedDir)) return;

    let stat;
    try {
      stat = fs.lstatSync(resolvedDir);
    } catch {
      return;
    }
    
    if (stat.isSymbolicLink()) return;

    if (stat.isDirectory()) {
      let items;
      try {
         items = fs.readdirSync(resolvedDir);
      } catch {
         return;
      }
      
      for (const item of items) {
        if (item === '.' || item === '..') continue;
        
        const itemPath = path.resolve(resolvedDir, item);
        
        if (!this.isPathInside(allowedRoot, itemPath)) {
          continue;
        }
        
        let itemStat;
        try {
          itemStat = fs.lstatSync(itemPath);
        } catch {
          continue;
        }

        if (itemStat.isSymbolicLink()) continue; // ignore symlinks

        if (itemStat.isDirectory()) {
          this.collectFiles(itemPath, allowedRoot, instanceId, filesArray);
        } else if (itemStat.isFile()) {
          try {
            const content = fs.readFileSync(itemPath, 'base64');
            const relativeToInstance = path.relative(allowedRoot, itemPath);
            filesArray.push({
              instanceId,
              relativePath: relativeToInstance.replace(/\\/g, '/'), // normalize separators
              encoding: 'base64',
              content
            });
          } catch (e) {
            console.warn(`[BackupService] Could not read file: ${itemPath}`, e);
          }
        }
      }
    }
  }

  public exportBackup(options: BackupOptions): Buffer {
    const { workspaceId, userId, mode, scopes } = options;

    const allScopes = [
      'auth', 'instances', 'contacts', 'media', 'templates', 
      'schedules', 'campaigns', 'automations', 'flows'
    ];
    const activeScopes = mode === 'full' ? allScopes : scopes;

    const result = {
      manifest: {
        format: "north-code-zap-backup",
        version: 1,
        appVersion: "1.7.0",
        createdAt: new Date().toISOString(),
        workspaceId,
        userId,
        mode,
        scopes: activeScopes
      },
      data: {
        auth: {},
        instances: [] as any[],
        templates: [] as any[],
        schedules: [] as any[],
        campaigns: [] as any[],
        campaignHistory: [] as any[],
        automations: [] as any[],
        flows: [] as any[],
        flowExecutions: [] as any[]
      },
      files: [] as any[]
    };

    // --- SCOPE: auth ---
    if (activeScopes.includes('auth')) {
      const workspacesFile = path.join(DATA_DIR, 'auth', 'workspaces.json');
      const usersFile = path.join(DATA_DIR, 'auth', 'users.json');
      const sessionsFile = path.join(DATA_DIR, 'auth', 'sessions.json');

      const workspaces = this.safeReadJson(workspacesFile) || [];
      const users = this.safeReadJson(usersFile) || [];
      const sessions = this.safeReadJson(sessionsFile) || [];

      const workspace = workspaces.find((w: any) => w.id === workspaceId);
      const workspaceUsers = users.filter((u: any) => u.workspaceId === workspaceId);
      const userIds = new Set(workspaceUsers.map((u: any) => u.id));
      const workspaceSessions = sessions.filter((s: any) => userIds.has(s.userId));

      result.data.auth = {
        workspaces: workspace ? [workspace] : [],
        users: workspaceUsers,
        sessions: workspaceSessions
      };
    }

    // --- We always need instances metadata to filter correctly, even if not exporting 'instances' scope fully ---
    const instancesFile = path.join(DATA_DIR, 'instances.json');
    const allInstances = this.safeReadJson(instancesFile) || [];
    const workspaceInstances = allInstances.filter((inst: any) => inst.workspaceId === workspaceId);
    const instanceIds = new Set(workspaceInstances.map((i: any) => i.id));
    
    const instancesRoot = path.resolve(DATA_DIR, 'instances');

    // --- SCOPE: instances ---
    if (activeScopes.includes('instances')) {
      result.data.instances = workspaceInstances;
      
      // Include DATA_DIR/instances/<id>/auth/**
      for (const inst of workspaceInstances) {
        const instanceRoot = path.resolve(instancesRoot, inst.id);
        if (!this.isPathInside(instancesRoot, instanceRoot)) {
           throw new Error(`Invalid instance ID: ${inst.id}`);
        }
        const authDir = path.resolve(instanceRoot, 'auth');
        this.collectFiles(authDir, instanceRoot, inst.id, result.files);
      }
    }

    // --- SCOPE: contacts ---
    if (activeScopes.includes('contacts')) {
      for (const instId of instanceIds as unknown as Set<string>) {
        const instanceRoot = path.resolve(instancesRoot, instId);
        if (!this.isPathInside(instancesRoot, instanceRoot)) {
           throw new Error(`Invalid instance ID: ${instId}`);
        }
        const recipientsDir = path.resolve(instanceRoot, 'recipients');
        this.collectFiles(recipientsDir, instanceRoot, instId, result.files);
      }
    }

    // --- SCOPE: media ---
    if (activeScopes.includes('media')) {
      for (const instId of instanceIds as unknown as Set<string>) {
        const instanceRoot = path.resolve(instancesRoot, instId);
        if (!this.isPathInside(instancesRoot, instanceRoot)) {
           throw new Error(`Invalid instance ID: ${instId}`);
        }
        const mediaDir = path.resolve(instanceRoot, 'media');
        this.collectFiles(mediaDir, instanceRoot, instId, result.files);
      }
    }

    // --- SCOPE: templates ---
    if (activeScopes.includes('templates')) {
      const file = path.join(DATA_DIR, 'templates', 'templates.json');
      const items = this.safeReadJson(file) || [];
      result.data.templates = items.filter((x: any) => x.workspaceId === workspaceId);
    }

    // --- SCOPE: campaigns ---
    if (activeScopes.includes('campaigns')) {
      const file = path.join(DATA_DIR, 'campaigns', 'campaigns.json');
      const items = this.safeReadJson(file) || [];
      result.data.campaigns = items.filter((x: any) => x.workspaceId === workspaceId);

      const histFile = path.join(DATA_DIR, 'history', 'executions.json');
      const histItems = this.safeReadJson(histFile) || [];
      result.data.campaignHistory = histItems.filter((x: any) => x.workspaceId === workspaceId);
    }

    // --- SCOPE: automations ---
    if (activeScopes.includes('automations')) {
      const file = path.join(DATA_DIR, 'automations', 'automations.json');
      const items = this.safeReadJson(file) || [];
      result.data.automations = items.filter((x: any) => x.workspaceId === workspaceId);
    }

    // --- SCOPE: flows ---
    if (activeScopes.includes('flows')) {
      const file = path.join(DATA_DIR, 'flows', 'flows.json');
      const items = this.safeReadJson(file) || [];
      result.data.flows = items.filter((x: any) => x.workspaceId === workspaceId);

      const execFile = path.join(DATA_DIR, 'flows', 'executions.json');
      const execItems = this.safeReadJson(execFile) || [];
      result.data.flowExecutions = execItems.filter((x: any) => x.workspaceId === workspaceId);
    }

    // --- SCOPE: schedules ---
    if (activeScopes.includes('schedules')) {
      const file = path.join(DATA_DIR, 'scheduler', 'schedules.json');
      const items = this.safeReadJson(file) || [];
      result.data.schedules = items.filter((x: any) => instanceIds.has(x.instanceId));
    }

    // Serialize and compress
    const jsonString = JSON.stringify(result);
    return zlib.gzipSync(jsonString);
  }
}

export const backupService = new BackupService();
