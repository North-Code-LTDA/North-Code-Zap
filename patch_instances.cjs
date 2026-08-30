const fs = require('fs');
let content = fs.readFileSync('server/instances.ts', 'utf-8');

const insertion = `
  public flushWorkspaceForRestore(workspaceId: string) {
    for (const runtime of this.runtimes.values()) {
      if (runtime.metadata.workspaceId === workspaceId) {
        runtime.contacts.flushPendingSave();
      }
    }
  }

  public suspendWorkspaceForRestore(workspaceId: string) {
    const idsToRemove = [];
    for (const [id, runtime] of this.runtimes.entries()) {
      if (runtime.metadata.workspaceId === workspaceId) {
        if (runtime.whatsapp && typeof (runtime.whatsapp as any).suspendForRestore === 'function') {
           (runtime.whatsapp as any).suspendForRestore();
        }
        idsToRemove.push(id);
      }
    }
    for (const id of idsToRemove) {
      this.runtimes.delete(id);
    }
  }

  public async reloadWorkspaceFromDisk(workspaceId: string) {
    const INSTANCES_FILE = require('path').join(DATA_DIR, 'instances.json');
    let metadatas: any[] = [];
    try {
      if (fs.existsSync(INSTANCES_FILE)) {
        const raw = fs.readFileSync(INSTANCES_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          metadatas = parsed;
        }
      }
    } catch (err) {}

    const validMetas = [];
    const seenIds = new Set<string>();

    for (const meta of metadatas) {
      if (!meta || typeof meta.id !== 'string') continue;
      if (meta.workspaceId !== workspaceId) continue;
      if (seenIds.has(meta.id)) continue;
      seenIds.add(meta.id);
      validMetas.push(meta);
    }

    for (const meta of validMetas) {
      this.createRuntime(meta);
    }

    for (const meta of validMetas) {
      const runtime = this.runtimes.get(meta.id);
      if (runtime) {
        const authDir = require('path').join(DATA_DIR, 'instances', runtime.metadata.id, 'auth');
        const credsFile = require('path').join(authDir, 'creds.json');
        if (fs.existsSync(credsFile)) {
          runtime.whatsapp.connect().catch(err => {
            console.error(\`[InstanceManager] Failed to auto-connect \${runtime.metadata.id} after restore:\`, err);
          });
        }
      }
    }
  }
`;

content = content.replace('export class InstanceManager {', 'export class InstanceManager {' + insertion);
fs.writeFileSync('server/instances.ts', content);
