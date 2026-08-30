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

  private collectFiles(dirPath: string, instanceId: string, baseRelativePath: string, filesArray: any[]) {
    // Basic protection against directory traversal attacks for input baseRelativePath (though internally generated)
    if (baseRelativePath.includes('..') || path.isAbsolute(baseRelativePath)) {
      console.warn(`[BackupService] Path traversal detected: ${baseRelativePath}`);
      return;
    }

    if (!fs.existsSync(dirPath)) return;

    // Reject symbolic links in this V1 as requested
    let stat;
    try {
      stat = fs.lstatSync(dirPath);
    } catch {
      return;
    }
    
    if (stat.isSymbolicLink()) return;

    if (stat.isDirectory()) {
      let items;
      try {
         items = fs.readdirSync(dirPath);
      } catch {
         return;
      }
      
      for (const item of items) {
        // Prevent path traversal
        if (item === '.' || item === '..') continue;
        const itemPath = path.join(dirPath, item);
        
        let itemStat;
        try {
          itemStat = fs.lstatSync(itemPath);
        } catch {
          continue;
        }

        if (itemStat.isSymbolicLink()) continue; // ignore symlinks

        if (itemStat.isDirectory()) {
          this.collectFiles(itemPath, instanceId, path.join(baseRelativePath, item), filesArray);
        } else if (itemStat.isFile()) {
          // Read as base64
          try {
            const content = fs.readFileSync(itemPath, 'base64');
            filesArray.push({
              instanceId,
              relativePath: path.join(baseRelativePath, item).replace(/\\/g, '/'), // normalize separators
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

    // --- SCOPE: instances ---
    if (activeScopes.includes('instances')) {
      result.data.instances = workspaceInstances;
      
      // Include DATA_DIR/instances/<id>/auth/**
      for (const inst of workspaceInstances) {
        const authDir = path.join(DATA_DIR, 'instances', inst.id, 'auth');
        this.collectFiles(authDir, inst.id, 'auth', result.files);
      }
    }

    // --- SCOPE: contacts ---
    if (activeScopes.includes('contacts')) {
      for (const instId of instanceIds as unknown as Set<string>) {
        const recipientsDir = path.join(DATA_DIR, 'instances', instId, 'recipients');
        this.collectFiles(recipientsDir, instId, 'recipients', result.files);
      }
    }

    // --- SCOPE: media ---
    if (activeScopes.includes('media')) {
      for (const instId of instanceIds as unknown as Set<string>) {
        const mediaDir = path.join(DATA_DIR, 'instances', instId, 'media');
        this.collectFiles(mediaDir, instId, 'media', result.files);
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
