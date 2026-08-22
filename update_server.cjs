const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const regex = /function validateSchedulePayload\(body: any\): \{ valid: boolean; error\?: string; payload\?: any \} \{[\s\S]*?return \{\s*valid: true,\s*payload: \{\s*name,[\s\S]*?deliveryOptions,\s*\}\s*\};\s*\}/;

const validateCode = `
  function validateSchedulePayload(body: unknown): { valid: true; payload: SchedulePayload } | { valid: false; error: string } {
    if (!body || typeof body !== 'object') {
      return { valid: false, error: 'Payload inválido.' };
    }
    
    const hasOwn = (obj: object, prop: string) => Object.prototype.hasOwnProperty.call(obj, prop);

    const requiredFields = [
      'name', 'message', 'targets', 'scheduleType', 'scheduledAt',
      'dailyTimes', 'weeklyTimeSlots', 'media', 'fallbackName', 'deliveryOptions'
    ];

    for (const field of requiredFields) {
      if (!hasOwn(body, field)) {
        return { valid: false, error: \`Campo \${field} é obrigatório no payload.\` };
      }
    }

    const payload = body as Record<string, any>;

    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      return { valid: false, error: 'Nome do agendamento é obrigatório e deve ser uma string não vazia.' };
    }

    if (typeof payload.message !== 'string') {
      return { valid: false, error: 'Campo message deve ser uma string.' };
    }

    if (typeof payload.fallbackName !== 'string' || !payload.fallbackName.trim()) {
      return { valid: false, error: 'Campo fallbackName é obrigatório e deve ser uma string não vazia.' };
    }

    let validMedia = false;
    if (payload.media === null) {
      validMedia = true;
    } else if (typeof payload.media === 'object' && payload.media !== null) {
      if (payload.media.type === 'image') {
        if (payload.media.source === 'upload') {
          if (typeof payload.media.localPath === 'string' && payload.media.localPath.trim().length > 0) {
            validMedia = true;
          }
        } else if (payload.media.source === 'url') {
          if (typeof payload.media.url === 'string' && /^https?:\\/\\//i.test(payload.media.url)) {
            validMedia = true;
          }
        }
      }
    }

    if (!validMedia) {
      return { valid: false, error: 'Mídia inválida.' };
    }

    const hasText = payload.message.trim().length > 0;
    const hasMedia = payload.media !== null;

    if (!hasText && !hasMedia) {
      return { valid: false, error: 'O agendamento precisa ter pelo menos uma mensagem de texto ou uma imagem.' };
    }

    if (!Array.isArray(payload.targets) || payload.targets.length === 0) {
      return { valid: false, error: 'Pelo menos um destinatário é obrigatório.' };
    }

    const validSources = ['directory', 'manual', 'import', 'group_member', 'group'];
    for (const t of payload.targets) {
      if (t.type !== 'person' && t.type !== 'group') return { valid: false, error: 'Tipo de destinatário inválido.' };
      if (typeof t.jid !== 'string' || !t.jid.trim()) return { valid: false, error: 'JID de destinatário inválido.' };
      if (typeof t.label !== 'string' || !t.label.trim()) return { valid: false, error: 'Label de destinatário inválido.' };
      if (!validSources.includes(t.source)) return { valid: false, error: 'Source de destinatário inválido.' };
      
      if (t.type === 'group' && t.source !== 'group') return { valid: false, error: 'Source de grupo inválido.' };
      if (t.source === 'group_member' && t.type !== 'person') return { valid: false, error: 'Source de group_member deve ser person.' };
      if (t.source === 'directory' && t.type !== 'person') return { valid: false, error: 'Source de directory deve ser person.' };
      if (t.source === 'manual' && t.type !== 'person') return { valid: false, error: 'Source de manual deve ser person.' };
      if (t.source === 'import' && t.type !== 'person') return { valid: false, error: 'Source de import deve ser person.' };
    }

    if (!payload.deliveryOptions || typeof payload.deliveryOptions !== 'object') {
      return { valid: false, error: 'Opções de entrega ausentes ou inválidas.' };
    }
    const dOpt = payload.deliveryOptions;
    if (typeof dOpt.intervalBetweenMessagesMs !== 'number' || !Number.isFinite(dOpt.intervalBetweenMessagesMs) || dOpt.intervalBetweenMessagesMs < 1000) {
      return { valid: false, error: 'Intervalo de entrega inválido.' };
    }
    if (typeof dOpt.batchPauseEnabled !== 'boolean') {
      return { valid: false, error: 'batchPauseEnabled inválido.' };
    }
    if (typeof dOpt.batchSize !== 'number' || !Number.isInteger(dOpt.batchSize) || dOpt.batchSize < 1) {
      return { valid: false, error: 'batchSize inválido.' };
    }
    if (typeof dOpt.batchPauseMs !== 'number' || !Number.isFinite(dOpt.batchPauseMs) || dOpt.batchPauseMs < 60000) {
      return { valid: false, error: 'batchPauseMs inválido.' };
    }

    if (!['once', 'daily', 'weekly'].includes(payload.scheduleType)) {
      return { valid: false, error: 'Tipo de agendamento inválido.' };
    }

    if (!Array.isArray(payload.dailyTimes)) return { valid: false, error: 'dailyTimes deve ser um Array.' };
    if (!Array.isArray(payload.weeklyTimeSlots)) return { valid: false, error: 'weeklyTimeSlots deve ser um Array.' };

    let parsedScheduledAt = payload.scheduledAt;

    if (payload.scheduleType === 'once') {
      if (typeof payload.scheduledAt !== 'string') {
        return { valid: false, error: 'Informe uma data e horário válidos para o agendamento único.' };
      }
      const parsedDate = new Date(payload.scheduledAt);
      if (isNaN(parsedDate.getTime())) {
        return { valid: false, error: 'Data e horário inválidos.' };
      }
      if (parsedDate.getTime() <= Date.now()) {
        return { valid: false, error: 'O horário do agendamento deve estar no futuro.' };
      }
      if (payload.dailyTimes.length > 0) return { valid: false, error: 'dailyTimes deve ser vazio para once.' };
      if (payload.weeklyTimeSlots.length > 0) return { valid: false, error: 'weeklyTimeSlots deve ser vazio para once.' };
      parsedScheduledAt = parsedDate.toISOString();
    } else if (payload.scheduleType === 'daily') {
      if (payload.scheduledAt !== null) return { valid: false, error: 'scheduledAt deve ser null para daily.' };
      if (payload.dailyTimes.length === 0) return { valid: false, error: 'Adicione pelo menos um horário diário válido.' };
      if (!validateDaily(payload.dailyTimes)) return { valid: false, error: 'Adicione pelo menos um horário diário válido.' };
      if (payload.weeklyTimeSlots.length > 0) return { valid: false, error: 'weeklyTimeSlots deve ser vazio para daily.' };
    } else if (payload.scheduleType === 'weekly') {
      if (payload.scheduledAt !== null) return { valid: false, error: 'scheduledAt deve ser null para weekly.' };
      if (payload.dailyTimes.length > 0) return { valid: false, error: 'dailyTimes deve ser vazio para weekly.' };
      if (payload.weeklyTimeSlots.length === 0) return { valid: false, error: 'Configure pelo menos um dia e horário semanal válido.' };
      if (!validateWeekly(payload.weeklyTimeSlots)) return { valid: false, error: 'Configure pelo menos um dia e horário semanal válido.' };
    }

    const validPayload: SchedulePayload = {
      name: payload.name.trim(),
      message: payload.message,
      targets: payload.targets,
      scheduleType: payload.scheduleType,
      scheduledAt: parsedScheduledAt,
      dailyTimes: payload.dailyTimes,
      weeklyTimeSlots: payload.weeklyTimeSlots,
      media: payload.media,
      fallbackName: payload.fallbackName.trim(),
      deliveryOptions: payload.deliveryOptions
    };

    return {
      valid: true,
      payload: validPayload
    };
  }`;

content = content.replace(regex, validateCode.trim());
fs.writeFileSync('server.ts', content);
