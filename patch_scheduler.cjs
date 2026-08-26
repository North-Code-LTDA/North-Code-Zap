const fs = require('fs');

let content = fs.readFileSync('server/scheduler.ts', 'utf8');

// I will find the executeSchedule loop and extract it.
// Actually, it's easier to just inject the new executeTransientMessage method at the end of the class.

const transientMethod = `

  public async executeTransientMessage(params: {
    instanceId: string;
    name: string;
    message: string;
    target: ScheduledTarget;
    fallbackName: string;
  }): Promise<ScheduleLastResult> {
    const { instanceId, message, target, fallbackName } = params;
    
    console.log(\`[Scheduler] executing transient message="\${params.name}" target=\${target.label || target.jid}\`);
    const executionSeed = \`transient_\${Date.now()}\`;
    const details: ScheduleExecutionDetail[] = [];
    let sentCount = 0;
    let failedCount = 0;

    // Personalize message with template renderer
    const renderedMessage = renderMessageTemplate(
      message || '',
      target,
      fallbackName || 'amigo(a)',
      { seed: executionSeed }
    );

    const instance = this.instanceManager.get(instanceId);
    if (!instance || !instance.whatsapp) {
      console.log(\`[Scheduler] WhatsApp not found for instance=\${instanceId}\`);
      failedCount++;
      details.push({
        targetJid: target.jid,
        targetLabel: target.label,
        status: 'failed',
        renderedPreview: renderedMessage,
        error: 'Instância desconectada/inexistente',
      });
      return { totalTargets: 1, sentCount, failedCount, skippedCount: 0, executedAt: new Date().toISOString(), details };
    }

    const state = instance.whatsapp.getState();
    if (state.status !== 'connected') {
      console.log(\`[Scheduler] WhatsApp disconnected during transient message target=\${target.label}\`);
      failedCount++;
      details.push({
        targetJid: target.jid,
        targetLabel: target.label,
        status: 'failed',
        renderedPreview: renderedMessage,
        error: 'WhatsApp desconectado',
      });
      return { totalTargets: 1, sentCount, failedCount, skippedCount: 0, executedAt: new Date().toISOString(), details };
    }

    // Attempt send with retry and small backoff
    let attemptSuccess = false;
    let lastError = '';
    let messageId = undefined;

    for (let attempt = 1; attempt <= MAX_SEND_RETRIES; attempt++) {
      try {
        const sendRes = await instance.whatsapp.sendTextMessage(target.jid, renderedMessage);
        if (sendRes.success) {
          attemptSuccess = true;
          messageId = sendRes.message?.id;
          break;
        } else {
          lastError = sendRes.error || 'Falha no envio da mensagem';
        }
      } catch (err) {
        lastError = err?.message || 'Erro inesperado';
      }

      if (attempt < MAX_SEND_RETRIES) {
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }

    if (attemptSuccess) {
      sentCount++;
      console.log(\`[Scheduler] sent transient target=\${target.label || target.jid} id=\${messageId || 'unknown'}\`);
      details.push({
        targetJid: target.jid,
        targetLabel: target.label,
        status: 'sent',
        messageId,
        renderedPreview: renderedMessage,
        sentAt: new Date().toISOString(),
      });
    } else {
      failedCount++;
      console.log(\`[Scheduler] failed transient target=\${target.label || target.jid} error=\${lastError}\`);
      details.push({
        targetJid: target.jid,
        targetLabel: target.label,
        status: 'failed',
        renderedPreview: renderedMessage,
        error: lastError,
      });
    }

    return {
      totalTargets: 1,
      sentCount,
      failedCount,
      skippedCount: 0,
      executedAt: new Date().toISOString(),
      details,
    };
  }
`;

content = content.replace(/}\s*$/g, transientMethod + '\n}\n');

fs.writeFileSync('server/scheduler.ts', content);

