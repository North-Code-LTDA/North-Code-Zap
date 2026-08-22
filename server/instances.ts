import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WhatsAppService } from './whatsapp.ts';
import { ContactsService } from './contacts.ts';
import { MediaService } from './media.ts';
import type { Server as SocketIOServer } from 'socket.io';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const INSTANCES_FILE = path.join(DATA_DIR, 'instances.json');

export interface InstanceMetadata {
  id: string;
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
  private schedulerService: any = null;

  constructor() {
    this.ensureDirectory();
  }

  public setSocketIO(io: SocketIOServer) {
    this.io = io;
  }
  
  public setScheduler(schedulerService: any) {
    this.schedulerService = schedulerService;
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
    let metadatas: InstanceMetadata[] = [];
    try {
      if (fs.existsSync(INSTANCES_FILE)) {
        const raw = fs.readFileSync(INSTANCES_FILE, 'utf-8');
        metadatas = JSON.parse(raw);
      }
    } catch (err) {
      console.error('[InstanceManager] error loading instances.json:', err);
    }

    for (const meta of metadatas) {
      if (typeof meta.id === 'string' && typeof meta.name === 'string') {
        this.createRuntime(meta);
      }
    }
    
    // Auto-connect instances that have credentials
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

  public createInstance(name: string): InstanceMetadata {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const meta: InstanceMetadata = {
      id,
      name: name.trim(),
      createdAt: now,
      updatedAt: now
    };

    this.createRuntime(meta);
    this.saveMetadatas();
    return meta;
  }

  public renameInstance(id: string, newName: string): InstanceMetadata | null {
    const runtime = this.runtimes.get(id);
    if (!runtime) return null;

    runtime.metadata.name = newName.trim();
    runtime.metadata.updatedAt = new Date().toISOString();
    this.saveMetadatas();
    return runtime.metadata;
  }

  public deleteInstance(id: string): boolean {
    const runtime = this.runtimes.get(id);
    if (!runtime) return false;

    // Disconnect
    runtime.whatsapp.disconnect();
    
    // Stop reconnect timers
    runtime.whatsapp.clearReconnectTimer();

    // Remove from scheduler
    if (this.schedulerService) {
      this.schedulerService.deleteAllForInstance(id);
    }

    // Remove from map
    this.runtimes.delete(id);
    this.saveMetadatas();

    // Remove directory
    try {
      const instanceDir = path.join(DATA_DIR, 'instances', id);
      if (fs.existsSync(instanceDir)) {
        fs.rmSync(instanceDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[InstanceManager] error deleting instance dir \${id}:`, err);
    }

    return true;
  }

  public get(id: string): InstanceRuntime | undefined {
    return this.runtimes.get(id);
  }

  public list(): InstanceMetadata[] {
    return Array.from(this.runtimes.values()).map(r => r.metadata);
  }
}
