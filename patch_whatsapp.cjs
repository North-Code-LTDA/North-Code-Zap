const fs = require('fs');
let content = fs.readFileSync('server/whatsapp.ts', 'utf-8');

const insertion = `
  public suspendForRestore(): void {
    console.log(\`[WhatsApp] suspending instance \${this.instanceId} for restore\`);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.autoReconnectBlocked = true;
    if (typeof (this as any).stopConnectionSupervisor === 'function') {
      (this as any).stopConnectionSupervisor();
    }
    this.isStarting = false;
    this.restartInProgress = false;

    try {
      if (this.sock) {
        this.sock.end(undefined);
        this.sock = null;
      }
    } catch (err: any) {
      console.error(\`[WhatsApp] error during suspendForRestore for \${this.instanceId}:\`, err?.message);
    } finally {
      this.currentQR = null;
      this.currentQRDataUrl = null;
    }
  }
`;

content = content.replace('export class WhatsAppService {', 'export class WhatsAppService {' + insertion);
fs.writeFileSync('server/whatsapp.ts', content);
