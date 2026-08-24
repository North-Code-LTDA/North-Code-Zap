import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WhatsAppService } from './whatsapp.ts';
import { ContactsService } from './contacts.ts';
import { MediaService } from './media.ts';
import type { Server as SocketIOServer } from 'socket.io';

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isValidDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const INSTANCES_FILE = path.join(DATA_DIR, 'instances.json');

export interface InstanceMetadata {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstanceRuntime {
  metadata: InstanceMetadata;
  whatsapp: WhatsAppService;
  contacts: ContactsService;
  media: MediaService;
}

export class InstanceManager {
  private runtimes = new Map<string, InstanceRuntime>();
  private io: SocketIOServer | null = null;
  private deletingInstances = new Set<string>();

  constructor() {
    this.ensureDirectory();
  }

  public setSocketIO(io: SocketIOServer) {
    this.io = io;
    for (const runtime of this.runtimes.values()) {
      runtime.whatsapp.setSocketIO(io);
    }
  }
  
  
  private ensureDirectory() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err) {
      console.error('[InstanceManager] error creating DATA_DIR:', err);
    }
  }

  public async init() {
    let metadatas: any[] = [];
    try {
      if (fs.existsSync(INSTANCES_FILE)) {
        const raw = fs.readFileSync(INSTANCES_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          metadatas = parsed;
        } else {
          console.warn('[InstanceManager] instances.json is not an array. Initializing empty.');
        }
      }
    } catch (err) {
      console.error('[InstanceManager] error loading instances.json:', err);
    }

    const validMetas: InstanceMetadata[] = [];
    const seenIds = new Set<string>();

    for (const meta of metadatas) {
      if (!meta || typeof meta.id !== 'string' || !isValidUuid(meta.id)) {
        console.warn('[InstanceManager] Invalid or missing id in instances.json');
        continue;
      }
      if (typeof meta.workspaceId !== 'string' || !isValidUuid(meta.workspaceId)) {
        console.warn(`[InstanceManager] Missing or invalid workspaceId for instance: ${meta.id}`);
        continue;
      }
      if (seenIds.has(meta.id)) {
        console.warn(`[InstanceManager] Duplicate instance ID found: ${meta.id}. Ignoring duplicate.`);
        continue;
      }
      if (typeof meta.name !== 'string' || !meta.name.trim()) {
        console.warn(`[InstanceManager] Invalid name for instance: ${meta.id}`);
        continue;
      }
      if (typeof meta.createdAt !== 'string' || !isValidDate(meta.createdAt)) {
        console.warn(`[InstanceManager] Invalid createdAt for instance: ${meta.id}`);
        continue;
      }
      if (typeof meta.updatedAt !== 'string' || !isValidDate(meta.updatedAt)) {
        console.warn(`[InstanceManager] Invalid updatedAt for instance: ${meta.id}`);
        continue;
      }

      seenIds.add(meta.id);
      validMetas.push({
        id: meta.id,
        workspaceId: meta.workspaceId,
        name: meta.name.trim(),
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt
      });
    }

    for (const meta of validMetas) {
      this.createRuntime(meta);
    }
    
    for (const runtime of this.runtimes.values()) {
      const authDir = path.join(DATA_DIR, 'instances', runtime.metadata.id, 'auth');
      const credsFile = path.join(authDir, 'creds.json');
      if (fs.existsSync(credsFile)) {
        runtime.whatsapp.connect().catch(err => {
          console.error(`[InstanceManager] Failed to auto-connect \${runtime.metadata.id}:`, err);
        });
      }
    }
  }

  private saveMetadatas() {
    try {
      const metadatas = Array.from(this.runtimes.values()).map(r => r.metadata);
      const tmp = INSTANCES_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(metadatas, null, 2), 'utf-8');
      fs.renameSync(tmp, INSTANCES_FILE);
    } catch (err) {
      console.error('[InstanceManager] error saving instances.json:', err);
    }
  }

  private createRuntime(meta: InstanceMetadata): InstanceRuntime {
    const instanceDir = path.join(DATA_DIR, 'instances', meta.id);
    const authDir = path.join(instanceDir, 'auth');
    const recipientsDir = path.join(instanceDir, 'recipients');
    const mediaDir = path.join(instanceDir, 'media');

    [authDir, recipientsDir, mediaDir].forEach(d => {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    });

    const contactsFile = path.join(recipientsDir, 'contacts.json');
    const contacts = new ContactsService(contactsFile);
    const media = new MediaService(mediaDir);
    const whatsapp = new WhatsAppService(meta.id, authDir, contacts);
    
    if (this.io) {
      whatsapp.setSocketIO(this.io);
    }

    const runtime: InstanceRuntime = {
      metadata: meta,
      whatsapp,
      contacts,
      media
    };

    this.runtimes.set(meta.id, runtime);
    return runtime;
  }

  public createInstance(name: string, workspaceId: string): InstanceMetadata {
    if (typeof name !== 'string' || !name.trim()) throw new Error('Nome de instância inválido.');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const meta: InstanceMetadata = {
      id,
      workspaceId,
      name: name.trim(),
      createdAt: now,
      updatedAt: now
    };

    this.createRuntime(meta);
    this.saveMetadatas();
    return meta;
  }

  public renameInstance(id: string, newName: string): InstanceMetadata | null {
    if (typeof newName !== 'string' || !newName.trim()) throw new Error('Nome de instância inválido.');
    const runtime = this.runtimes.get(id);
    if (!runtime) return null;

    runtime.metadata.name = newName.trim();
    runtime.metadata.updatedAt = new Date().toISOString();
    this.saveMetadatas();
    return runtime.metadata;
  }

  public async deleteInstance(id: string): Promise<boolean> {
    if (this.deletingInstances.has(id)) return false;
    const runtime = this.runtimes.get(id);
    if (!runtime) return false;

    this.deletingInstances.add(id);

    try {
      runtime.whatsapp.clearReconnectTimer?.();
      await runtime.whatsapp.disconnect();
      
      this.runtimes.delete(id);
      this.saveMetadatas();

      const instanceDir = path.join(DATA_DIR, 'instances', id);
      if (fs.existsSync(instanceDir)) {
        fs.rmSync(instanceDir, { recursive: true, force: true });
      }
      return true;
    } catch (err) {
      console.error(`[InstanceManager] error deleting instance ${id}:`, err);
      return false;
    } finally {
      this.deletingInstances.delete(id);
    }
  }

  public getForWorkspace(id: string, workspaceId: string): InstanceRuntime | undefined {
    const runtime = this.runtimes.get(id);
    if (!runtime) return undefined;
    if (runtime.metadata.workspaceId !== workspaceId) return undefined;
    return runtime;
  }

  public listForWorkspace(workspaceId: string): InstanceMetadata[] {
    return Array.from(this.runtimes.values())
      .filter(r => r.metadata.workspaceId === workspaceId)
      .map(r => r.metadata);
  }

  public get(id: string): InstanceRuntime | undefined {
    return this.runtimes.get(id);
  }

  public list(): InstanceMetadata[] {
    return Array.from(this.runtimes.values()).map(r => r.metadata);
  }
}
