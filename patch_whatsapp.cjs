const fs = require('fs');
let code = fs.readFileSync('server/whatsapp.ts', 'utf-8');

// 1. In OTHER ERRORS
code = code.replace(
  /(\/\/ 4\. OTHER ERRORS\s*)this\.restartInProgress = false;\s*this\.updateStatus\('error',\s*\{\s*error: statusCode \? \`Conexão encerrada \(código \$\{statusCode\}\)\` : errorMessage,\s*\}\);/,
  `$1this.autoReconnectBlocked = true;
        this.reconnectAttempt = 0;
        this.clearReconnectTimer();
        this.stopConnectionSupervisor();
        
        this.restartInProgress = false;
        this.updateStatus('error', {
          error: statusCode ? \`Conexão encerrada (código \${statusCode})\` : errorMessage,
        });`
);

// 2. In LOGGED OUT (401)
code = code.replace(
  /this\.reconnectAttempt = 0;\s*this\.stopConnectionSupervisor\(\);/,
  `this.reconnectAttempt = 0;
          this.clearReconnectTimer();
          this.stopConnectionSupervisor();`
);

// 3. In doRestart
code = code.replace(
  /const doRestart = async \(\) => \{\s*try \{/,
  `const doRestart = async () => {
      this.reconnectTimer = null;
      if (this.autoReconnectBlocked) {
        console.log('[WhatsApp] reconnect cancelled because auto reconnect is blocked');
        this.restartInProgress = false;
        return;
      }
      try {`
);

// 4. In ensureConnected
code = code.replace(
  /public ensureConnected\(reason = 'external'\): boolean \{[\s\S]*?return false;\s*\}/,
  `public ensureConnected(reason = 'external'): boolean {
    if (this.currentStatus === 'connected') return true;
    if (this.autoReconnectBlocked) return false;
    if (!this.hasSavedSession()) return false;
    if (this.isStarting || this.restartInProgress || this.reconnectTimer) return false;

    let recoverable = false;

    if (this.currentStatus === 'disconnected') {
      recoverable = true;
    } else if (
      this.currentStatus === 'error' &&
      this.isTransientDisconnectCode(this.lastDisconnectCode)
    ) {
      recoverable = true;
    } else if (
      this.currentStatus === 'connecting' &&
      Date.now() - this.statusChangedAt > CONNECTING_STALL_MS
    ) {
      recoverable = true;
    }

    if (!recoverable) {
      console.log(\`[WhatsApp] ensureConnected ignored reason=\${reason} status=\${this.currentStatus} code=\${this.lastDisconnectCode}\`);
      return false;
    }

    console.log(\`[WhatsApp] ensureConnected requested reason=\${reason} status=\${this.currentStatus}\`);
    const delay = this.getReconnectDelay();
    this.reconnectAttempt++;
    this.restartWhatsAppConnection(delay);
    return false;
  }`
);

fs.writeFileSync('server/whatsapp.ts', code);
console.log('Whatsapp patch applied');
