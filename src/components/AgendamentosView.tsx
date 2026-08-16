import { useState, useMemo, type FormEvent } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit2,
  Users,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Search,
  Radio,
  Phone,
  Info,
  X,
  RefreshCw,
  Sparkles,
  Send,
  MessageSquare,
} from 'lucide-react';
import type {
  ScheduledMessage,
  ScheduledTarget,
  ScheduleType,
  WhatsAppGroup,
  ReceivedMessage,
  WhatsAppAccountInfo,
  ScheduleLastResult,
} from '../types';
import { useSchedules } from '../hooks/useSchedules';

interface AgendamentosViewProps {
  messages: ReceivedMessage[];
  whatsappState: WhatsAppAccountInfo;
}

const WEEK_DAYS = [
  { id: 0, label: 'Dom', full: 'Domingo' },
  { id: 1, label: 'Seg', full: 'Segunda-feira' },
  { id: 2, label: 'Ter', full: 'Terça-feira' },
  { id: 3, label: 'Qua', full: 'Quarta-feira' },
  { id: 4, label: 'Qui', full: 'Quinta-feira' },
  { id: 5, label: 'Sex', full: 'Sexta-feira' },
  { id: 6, label: 'Sáb', full: 'Sábado' },
];

export function AgendamentosView({ messages, whatsappState }: AgendamentosViewProps) {
  const {
    schedules,
    groups,
    loadingSchedules,
    loadingGroups,
    currentProgress,
    executingScheduleId,
    fetchGroups,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    pauseSchedule,
    resumeSchedule,
    runNow,
  } = useSchedules();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledMessage | null>(null);
  const [selectedResultDetails, setSelectedResultDetails] = useState<{
    scheduleName: string;
    result: ScheduleLastResult;
  } | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formType, setFormType] = useState<ScheduleType>('once');
  const [formDate, setFormDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [formTime, setFormTime] = useState('08:00');
  const [formWeeklyDays, setFormWeeklyDays] = useState<number[]>([1]); // Seg
  const [formTargets, setFormTargets] = useState<ScheduledTarget[]>([]);

  // Targets picker sub-state
  const [pickerTab, setPickerTab] = useState<'pessoas' | 'grupos'>('pessoas');
  const [pickerSearch, setPickerSearch] = useState('');
  const [manualNumberInput, setManualNumberInput] = useState('');
  const [manualNameInput, setManualNameInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isConnected = whatsappState.status === 'connected';

  // Extract unique contacts from received/sent messages
  const knownContacts = useMemo(() => {
    const map = new Map<string, { jid: string; number: string; name: string }>();
    for (const msg of messages) {
      if (!msg.remoteJid.endsWith('@g.us') && !msg.remoteJid.includes('@broadcast')) {
        const rawNum = msg.remoteJid.split('@')[0].split(':')[0];
        if (!map.has(msg.remoteJid)) {
          map.set(msg.remoteJid, {
            jid: msg.remoteJid,
            number: rawNum,
            name: msg.pushName || `+${rawNum}`,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [messages]);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    if (!pickerSearch.trim()) return knownContacts;
    const term = pickerSearch.toLowerCase();
    return knownContacts.filter(
      (c) => c.name.toLowerCase().includes(term) || c.number.includes(term)
    );
  }, [knownContacts, pickerSearch]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!pickerSearch.trim()) return groups;
    const term = pickerSearch.toLowerCase();
    return groups.filter(
      (g) => g.subject.toLowerCase().includes(term) || g.id.toLowerCase().includes(term)
    );
  }, [groups, pickerSearch]);

  const handleOpenNewModal = () => {
    setEditingSchedule(null);
    setFormName('');
    setFormMessage('');
    setFormType('once');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setFormDate(tomorrow.toISOString().split('T')[0]);
    setFormTime('08:00');
    setFormWeeklyDays([1]);
    setFormTargets([]);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (schedule: ScheduledMessage) => {
    setEditingSchedule(schedule);
    setFormName(schedule.name);
    setFormMessage(schedule.message);
    setFormType(schedule.scheduleType);

    if (schedule.scheduledAt) {
      const dt = new Date(schedule.scheduledAt);
      if (!isNaN(dt.getTime())) {
        setFormDate(dt.toISOString().split('T')[0]);
        setFormTime(
          `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
        );
      }
    }
    if (schedule.timeOfDay) {
      setFormTime(schedule.timeOfDay);
    }
    if (schedule.weeklyDays) {
      setFormWeeklyDays(schedule.weeklyDays);
    }
    setFormTargets(schedule.targets || []);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleAddManualContact = () => {
    if (!manualNumberInput.trim()) return;
    let cleaned = manualNumberInput.replace(/\D/g, '');
    if (cleaned.length < 10) {
      setFormError('Número deve ter pelo menos 10 dígitos (DDD + Número).');
      return;
    }
    if (!cleaned.startsWith('55') && (cleaned.length === 10 || cleaned.length === 11)) {
      cleaned = '55' + cleaned;
    }

    const jid = `${cleaned}@s.whatsapp.net`;
    const label = manualNameInput.trim() || `+${cleaned}`;

    if (formTargets.some((t) => t.jid === jid)) {
      setFormError('Este número já foi adicionado aos destinatários.');
      return;
    }

    setFormTargets((prev) => [
      ...prev,
      {
        type: 'person',
        jid,
        label,
      },
    ]);

    setManualNumberInput('');
    setManualNameInput('');
    setFormError(null);
  };

  const handleToggleTarget = (target: ScheduledTarget) => {
    setFormTargets((prev) => {
      const exists = prev.some((t) => t.jid === target.jid);
      if (exists) {
        return prev.filter((t) => t.jid !== target.jid);
      } else {
        return [...prev, target];
      }
    });
  };

  const handleToggleWeeklyDay = (dayId: number) => {
    setFormWeeklyDays((prev) => {
      if (prev.includes(dayId)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((d) => d !== dayId);
      } else {
        return [...prev, dayId].sort();
      }
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Informe o nome do agendamento.');
      return;
    }
    if (!formMessage.trim()) {
      setFormError('Informe a mensagem a ser enviada.');
      return;
    }
    if (formTargets.length === 0) {
      setFormError('Selecione pelo menos 1 destinatário.');
      return;
    }

    let calculatedScheduledAt = new Date().toISOString();
    if (formType === 'once') {
      const dateTimeStr = `${formDate}T${formTime}:00`;
      const dt = new Date(dateTimeStr);
      if (isNaN(dt.getTime())) {
        setFormError('Data ou horário inválidos.');
        return;
      }
      calculatedScheduledAt = dt.toISOString();
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingSchedule) {
        const res = await updateSchedule(editingSchedule.id, {
          name: formName.trim(),
          message: formMessage.trim(),
          targets: formTargets,
          scheduleType: formType,
          scheduledAt: calculatedScheduledAt,
          weeklyDays: formWeeklyDays,
          timeOfDay: formTime,
          status: 'active',
        });
        if (!res.success) {
          setFormError(res.error || 'Falha ao atualizar agendamento');
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createSchedule({
          name: formName.trim(),
          message: formMessage.trim(),
          targets: formTargets,
          scheduleType: formType,
          scheduledAt: calculatedScheduledAt,
          weeklyDays: formWeeklyDays,
          timeOfDay: formTime,
        });
        if (!res.success) {
          setFormError(res.error || 'Falha ao criar agendamento');
          setIsSubmitting(false);
          return;
        }
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Erro inesperado');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunNow = async (id: string) => {
    if (!isConnected) {
      alert('Conecte o WhatsApp antes de executar o agendamento.');
      return;
    }
    const confirmed = window.confirm('Deseja disparar este agendamento imediatamente agora?');
    if (!confirmed) return;

    await runNow(id);
  };

  const formatNextRun = (schedule: ScheduledMessage) => {
    if (schedule.status === 'paused') return 'Pausado';
    if (schedule.status === 'completed') return 'Concluído';
    if (schedule.status === 'running') return 'Executando agora...';
    if (!schedule.nextRunAt) return 'Não programado';

    const dt = new Date(schedule.nextRunAt);
    if (isNaN(dt.getTime())) return '-';

    return dt.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatScheduleTypeBadge = (schedule: ScheduledMessage) => {
    if (schedule.scheduleType === 'once') {
      return 'Uma vez';
    }
    if (schedule.scheduleType === 'daily') {
      return `Diário às ${schedule.timeOfDay || '08:00'}`;
    }
    if (schedule.scheduleType === 'weekly') {
      const daysStr = (schedule.weeklyDays || [1])
        .map((d) => WEEK_DAYS.find((w) => w.id === d)?.label || d)
        .join(', ');
      return `Semanal (${daysStr}) às ${schedule.timeOfDay || '08:00'}`;
    }
    return schedule.scheduleType;
  };

  return (
    <div className="space-y-6" id="agendamentos-view">
      {/* Header Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Agendamentos de Mensagens
              </h1>
            </div>
            <p className="text-xs text-neutral-400">
              Envio automático e sequencial para pessoas e grupos com fila e persistência
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-800 border border-neutral-700 text-xs">
              <Radio
                className={`w-3.5 h-3.5 ${
                  isConnected ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'
                }`}
              />
              <span className="text-neutral-300 font-mono text-[11px]">
                {schedules.filter((s) => s.status === 'active').length} ativos • {schedules.length} total
              </span>
            </div>

            <button
              id="btn-novo-agendamento"
              onClick={handleOpenNewModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black shadow-lg shadow-emerald-500/10 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>NOVO AGENDAMENTO</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Live Progress Bar (if executing) */}
      {currentProgress && (
        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 shadow-lg animate-fade-in space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
              <div>
                <h4 className="text-xs font-bold text-white">
                  Executando: {currentProgress.scheduleName}
                </h4>
                <p className="text-[11px] text-emerald-300/80 font-mono">
                  Enviando para {currentProgress.targetLabel} ({currentProgress.currentIndex} de{' '}
                  {currentProgress.totalTargets})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-emerald-400 font-bold">
                {currentProgress.sentCount} enviados
              </span>
              {currentProgress.failedCount > 0 && (
                <span className="text-red-400 font-bold">
                  {currentProgress.failedCount} falhas
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden border border-emerald-500/20">
            <div
              className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
              style={{
                width: `${(currentProgress.currentIndex / currentProgress.totalTargets) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Schedules Cards List */}
      {loadingSchedules ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-12 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-xs text-neutral-400">Carregando agendamentos...</p>
        </div>
      ) : schedules.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-neutral-800/80 border border-neutral-700/50 flex items-center justify-center text-neutral-500 mx-auto">
            <Calendar className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-white">Nenhum agendamento cadastrado</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Crie agendamentos automáticos para enviar mensagens individuais ou para múltiplos grupos do WhatsApp em horários programados.
            </p>
          </div>
          <button
            onClick={handleOpenNewModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>CRIAR PRIMEIRO AGENDAMENTO</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {schedules.map((schedule) => {
            const isRunning =
              schedule.status === 'running' || executingScheduleId === schedule.id;

            return (
              <div
                key={schedule.id}
                id={`schedule-card-${schedule.id}`}
                className={`bg-neutral-900 border rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4 transition ${
                  isRunning
                    ? 'border-emerald-500/60 bg-emerald-950/10 ring-1 ring-emerald-500/30'
                    : 'border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {/* Card Top: Title, Status Badge, Frequency */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white truncate">{schedule.name}</h3>
                      <p className="text-[11px] text-emerald-400 font-mono mt-0.5">
                        {formatScheduleTypeBadge(schedule)}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase shrink-0 ${
                        isRunning
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse'
                          : schedule.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : schedule.status === 'paused'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : schedule.status === 'completed'
                          ? 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                          : 'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {isRunning ? 'EXECUTANDO' : schedule.status}
                    </span>
                  </div>

                  {/* Message Preview Box */}
                  <div className="p-3 bg-neutral-950/60 border border-neutral-800/80 rounded-xl">
                    <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed italic">
                      "{schedule.message}"
                    </p>
                  </div>

                  {/* Targets & Timing Info */}
                  <div className="space-y-1.5 text-xs text-neutral-400">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Destinatários:</span>
                      </span>
                      <span className="font-mono text-white font-bold">
                        {schedule.targets.length} destinos
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Próximo envio:</span>
                      </span>
                      <span className="font-mono text-neutral-300">
                        {formatNextRun(schedule)}
                      </span>
                    </div>
                  </div>

                  {/* Last Run Info (if exists) */}
                  {schedule.lastResult && (
                    <div className="p-2.5 bg-neutral-800/50 border border-neutral-700/50 rounded-xl text-[11px] flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          Último: {schedule.lastResult.sentCount} ok
                          {schedule.lastResult.failedCount > 0 &&
                            `, ${schedule.lastResult.failedCount} erro`}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          setSelectedResultDetails({
                            scheduleName: schedule.name,
                            result: schedule.lastResult!,
                          })
                        }
                        className="text-emerald-400 hover:text-emerald-300 text-[10px] font-bold underline cursor-pointer"
                      >
                        Ver detalhes
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Run Now Button */}
                    <button
                      id={`btn-run-now-${schedule.id}`}
                      onClick={() => handleRunNow(schedule.id)}
                      disabled={isRunning || !isConnected}
                      title="Disparar este agendamento agora mesmo"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      {isRunning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>Executar agora</span>
                    </button>

                    {/* Pause / Resume Button */}
                    {schedule.status === 'active' ? (
                      <button
                        onClick={() => pauseSchedule(schedule.id)}
                        disabled={isRunning}
                        title="Pausar agendamento"
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    ) : schedule.status === 'paused' ? (
                      <button
                        onClick={() => resumeSchedule(schedule.id)}
                        disabled={isRunning}
                        title="Retomar agendamento"
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Edit Button */}
                    <button
                      onClick={() => handleOpenEditModal(schedule)}
                      disabled={isRunning}
                      title="Editar agendamento"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => {
                        if (window.confirm(`Excluir o agendamento "${schedule.name}"?`)) {
                          deleteSchedule(schedule.id);
                        }
                      }}
                      disabled={isRunning}
                      title="Excluir agendamento"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-6 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {editingSchedule ? 'Editar Agendamento' : 'Novo Agendamento'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Nome */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">
                  Nome do Agendamento *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Aviso diário de reunião, Cobrança semanal, etc."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50"
                  required
                />
              </div>

              {/* Mensagem */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">
                  Mensagem WhatsApp *
                </label>
                <textarea
                  rows={3}
                  placeholder="Digite o texto que será enviado automaticamente..."
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50 resize-none"
                  required
                />
              </div>

              {/* Tipo de Frequência */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300">Frequência *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType('once')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      formType === 'once'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    Uma vez
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormType('daily')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      formType === 'daily'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    Diário
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormType('weekly')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      formType === 'weekly'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    Semanal
                  </button>
                </div>
              </div>

              {/* Timing Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-neutral-950/60 border border-neutral-800 rounded-xl">
                {formType === 'once' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-400">Data de Envio</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-neutral-400">Horário (HH:mm)</label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                {formType === 'weekly' && (
                  <div className="sm:col-span-2 space-y-1.5 pt-1">
                    <label className="text-[11px] font-semibold text-neutral-400">
                      Dias da Semana
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEK_DAYS.map((w) => {
                        const isSelected = formWeeklyDays.includes(w.id);
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => handleToggleWeeklyDay(w.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-500 text-black border-emerald-400 font-bold'
                                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                            }`}
                          >
                            {w.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Destinatários Selector */}
              <div className="space-y-3 border-t border-neutral-800 pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>Destinatários ({formTargets.length} selecionados)</span>
                  </label>

                  <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setPickerTab('pessoas')}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                        pickerTab === 'pessoas'
                          ? 'bg-neutral-800 text-white'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      Pessoas ({knownContacts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPickerTab('grupos');
                        if (groups.length === 0 && isConnected) {
                          fetchGroups();
                        }
                      }}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                        pickerTab === 'grupos'
                          ? 'bg-neutral-800 text-white'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      Grupos ({groups.length})
                    </button>
                  </div>
                </div>

                {/* Selected Targets Chips */}
                {formTargets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-neutral-950/70 border border-neutral-800 rounded-xl">
                    {formTargets.map((target) => (
                      <span
                        key={target.jid}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px]"
                      >
                        {target.type === 'group' ? (
                          <Users className="w-3 h-3" />
                        ) : (
                          <User className="w-3 h-3" />
                        )}
                        <span className="font-medium truncate max-w-[140px]">{target.label}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleTarget(target)}
                          className="text-emerald-400/60 hover:text-emerald-300 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Search & List Box */}
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={`Buscar ${pickerTab === 'pessoas' ? 'contatos' : 'grupos'}...`}
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* PESSOAS TAB CONTENT */}
                  {pickerTab === 'pessoas' && (
                    <div className="space-y-2">
                      {/* Manual Phone Add Bar */}
                      <div className="flex flex-col sm:flex-row items-center gap-2 p-2 bg-neutral-900/60 border border-neutral-800 rounded-lg">
                        <input
                          type="text"
                          placeholder="Número: 5593999999999"
                          value={manualNumberInput}
                          onChange={(e) => setManualNumberInput(e.target.value)}
                          className="w-full sm:w-1/2 px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-md text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                        <input
                          type="text"
                          placeholder="Nome (opcional)"
                          value={manualNameInput}
                          onChange={(e) => setManualNameInput(e.target.value)}
                          className="w-full sm:w-1/2 px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-md text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddManualContact}
                          className="w-full sm:w-auto px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-md text-xs font-bold transition shrink-0 cursor-pointer"
                        >
                          + Adicionar
                        </button>
                      </div>

                      {/* Known Contacts List */}
                      <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                        {filteredContacts.length === 0 ? (
                          <p className="text-[11px] text-neutral-500 text-center py-4">
                            Nenhum contato recente encontrado. Adicione um número manualmente acima.
                          </p>
                        ) : (
                          filteredContacts.map((c) => {
                            const isSelected = formTargets.some((t) => t.jid === c.jid);
                            return (
                              <div
                                key={c.jid}
                                onClick={() =>
                                  handleToggleTarget({
                                    type: 'person',
                                    jid: c.jid,
                                    label: c.name,
                                  })
                                }
                                className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition ${
                                  isSelected
                                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                                    : 'bg-neutral-900/60 hover:bg-neutral-900 border border-transparent text-neutral-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="rounded accent-emerald-500 cursor-pointer"
                                  />
                                  <span className="font-semibold truncate">{c.name}</span>
                                </div>
                                <span className="text-[10px] font-mono text-neutral-500">
                                  +{c.number}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* GRUPOS TAB CONTENT */}
                  {pickerTab === 'grupos' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] text-neutral-400">
                          Grupos do WhatsApp Conectado
                        </span>
                        <button
                          type="button"
                          onClick={() => fetchGroups()}
                          disabled={loadingGroups || !isConnected}
                          className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${loadingGroups ? 'animate-spin' : ''}`}
                          />
                          Atualizar grupos
                        </button>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                        {!isConnected ? (
                          <div className="p-4 text-center space-y-1">
                            <p className="text-xs text-amber-300 font-semibold">
                              WhatsApp Desconectado
                            </p>
                            <p className="text-[11px] text-neutral-500">
                              Conecte sua conta WhatsApp para carregar a lista de grupos.
                            </p>
                          </div>
                        ) : loadingGroups ? (
                          <div className="py-6 text-center">
                            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin mx-auto" />
                            <span className="text-[11px] text-neutral-500 mt-1 block">
                              Carregando grupos do Baileys...
                            </span>
                          </div>
                        ) : filteredGroups.length === 0 ? (
                          <p className="text-[11px] text-neutral-500 text-center py-4">
                            Nenhum grupo encontrado na conta conectada.
                          </p>
                        ) : (
                          filteredGroups.map((g) => {
                            const isSelected = formTargets.some((t) => t.jid === g.id);
                            return (
                              <div
                                key={g.id}
                                onClick={() =>
                                  handleToggleTarget({
                                    type: 'group',
                                    jid: g.id,
                                    label: g.subject,
                                  })
                                }
                                className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition ${
                                  isSelected
                                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                                    : 'bg-neutral-900/60 hover:bg-neutral-900 border border-transparent text-neutral-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="rounded accent-emerald-500 cursor-pointer"
                                  />
                                  <span className="font-semibold truncate">{g.subject}</span>
                                </div>
                                <span className="text-[10px] font-mono text-neutral-500 shrink-0">
                                  {g.participantsCount} membros
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black transition cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>SALVAR AGENDAMENTO</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXECUTION DETAILS MODAL */}
      {selectedResultDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-sm font-bold text-white">Relatório de Execução</h3>
                <p className="text-xs text-neutral-400">{selectedResultDetails.scheduleName}</p>
              </div>
              <button
                onClick={() => setSelectedResultDetails(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl">
                <span className="text-neutral-400 block text-[10px]">Total</span>
                <span className="text-white font-bold text-sm">
                  {selectedResultDetails.result.totalTargets}
                </span>
              </div>
              <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/20 rounded-xl">
                <span className="text-emerald-400 block text-[10px]">Enviados</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {selectedResultDetails.result.sentCount}
                </span>
              </div>
              <div className="p-2.5 bg-red-950/30 border border-red-500/20 rounded-xl">
                <span className="text-red-400 block text-[10px]">Falhas</span>
                <span className="text-red-400 font-bold text-sm">
                  {selectedResultDetails.result.failedCount}
                </span>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {selectedResultDetails.result.details.map((detail, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                    detail.status === 'sent'
                      ? 'bg-neutral-950 border-neutral-800'
                      : 'bg-red-950/20 border-red-500/30'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-white font-semibold block truncate">
                      {detail.targetLabel}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500 block truncate">
                      {detail.targetJid}
                    </span>
                    {detail.error && (
                      <span className="text-[10px] text-red-400 block mt-0.5">
                        Erro: {detail.error}
                      </span>
                    )}
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase shrink-0 ${
                      detail.status === 'sent'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {detail.status === 'sent' ? 'Enviado' : 'Falhou'}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-neutral-800 text-right">
              <button
                onClick={() => setSelectedResultDetails(null)}
                className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
