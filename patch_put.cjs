const fs = require('fs');
const content = fs.readFileSync('server.ts', 'utf-8');
const startIdx = content.indexOf("  app.put('/api/schedules/:id', (req, res) => {");
const endIdx = content.indexOf("  });", startIdx) + 5;
const replacement = `  app.put('/api/schedules/:id', (req, res) => {
    try {
      const {
        name,
        message,
        targets,
        scheduleType,
        scheduledAt,
        dailyTimes,
        weeklyTimeSlots,
        media,
        fallbackName,
        deliveryOptions,
      } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Nome do agendamento é obrigatório.' });
      }

      const hasText = Boolean(message && typeof message === 'string' && message.trim().length > 0);
      const hasMedia = Boolean(
        media &&
          media.type === 'image' &&
          (media.source === 'upload' ? Boolean(media.localPath) : Boolean(media.url))
      );

      if (!hasText && !hasMedia) {
        return res.status(400).json({
          success: false,
          error: 'O agendamento precisa ter pelo menos uma mensagem de texto ou uma imagem.',
        });
      }

      if (!Array.isArray(targets) || targets.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: 'Pelo menos um destinatário é obrigatório.' });
      }

      if (!['once', 'daily', 'weekly'].includes(scheduleType)) {
        return res.status(400).json({ success: false, error: 'Tipo de agendamento inválido.' });
      }

      let parsedScheduledAt = scheduledAt;

      if (scheduleType === 'once') {
        if (!scheduledAt) {
          return res.status(400).json({ success: false, error: 'Informe uma data e horário válidos para o agendamento único.' });
        }
        const parsedDate = new Date(scheduledAt);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ success: false, error: 'Data e horário inválidos.' });
        }
        if (parsedDate.getTime() <= Date.now()) {
          return res.status(400).json({ success: false, error: 'O horário do agendamento deve estar no futuro.' });
        }
        parsedScheduledAt = parsedDate.toISOString();
      } else if (scheduleType === 'daily') {
        if (!validateDaily(dailyTimes)) {
          return res.status(400).json({ success: false, error: 'Adicione pelo menos um horário diário válido.' });
        }
      } else if (scheduleType === 'weekly') {
        if (!validateWeekly(weeklyTimeSlots)) {
          return res.status(400).json({ success: false, error: 'Configure pelo menos um dia e horário semanal válido.' });
        }
      }

      const updated = schedulerService.update(req.params.id, {
        name,
        message: message || '',
        targets,
        scheduleType,
        scheduledAt: parsedScheduledAt,
        dailyTimes,
        weeklyTimeSlots,
        media,
        fallbackName,
        deliveryOptions,
      });

      if (!updated) {
        return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
      }

      res.json({ success: true, schedule: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao atualizar agendamento' });
    }
  });`;

fs.writeFileSync('server.ts', content.substring(0, startIdx) + replacement + content.substring(endIdx));
