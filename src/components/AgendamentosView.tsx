import { useState, useMemo, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
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
  FileSpreadsheet,
  Upload,
  UserCheck,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Timer,
  Sliders,
  Check,
} from 'lucide-react';
import type {
  ScheduledMessage,
  ScheduledTarget,
  ScheduleType,
  WhatsAppGroup,
  KnownContact,
  GroupParticipant,
  WhatsAppAccountInfo,
  ScheduleLastResult,
  DeliveryOptions,
} from '../types';
import { useSchedules } from '../hooks/useSchedules';
import { renderMessageTemplate } from '../utils/template';

interface AgendamentosViewProps {
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

export function AgendamentosView({ whatsappState }: AgendamentosViewProps) {
  const {
    schedules,
    groups,
    contacts,
    loadingSchedules,
    loadingGroups,
    loadingContacts,
    currentProgress,
    executingScheduleId,
    fetchGroups,
    fetchContacts,
    fetchGroupParticipants,
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
  const [formFallbackName, setFormFallbackName] = useState('amigo(a)');
  const [formType, setFormType] = useState<ScheduleType>('once');
  const [formDate, setFormDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [formTime, setFormTime] = useState('08:00');
  const [formWeeklyDays, setFormWeeklyDays] = useState<number[]>([1]); // Seg
  const [formTargets, setFormTargets] = useState<ScheduledTarget[]>([]);

  // Delivery Rhythm Options
  const [formIntervalSeconds, setFormIntervalSeconds] = useState(5);
  const [formBatchPauseEnabled, setFormBatchPauseEnabled] = useState(false);
  const [formBatchSize, setFormBatchSize] = useState(5);
  const [formBatchPauseMinutes, setFormBatchPauseMinutes] = useState(5);

  // Compliance Checkbox for imported numbers
  const [importComplianceChecked, setImportComplianceChecked] = useState(false);

  // Targets Picker Sub-state
  const [pickerTab, setPickerTab] = useState<'pessoas' | 'grupos' | 'importar'>('pessoas');
  const [pickerSearch, setPickerSearch] = useState('');
  const [manualNumberInput, setManualNumberInput] = useState('');
  const [manualNameInput, setManualNameInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group Members Expansion & Cache
  const [expandedGroupJids, setExpandedGroupJids] = useState<Set<string>>(new Set());
  const [groupParticipantsMap, setGroupParticipantsMap] = useState<Map<string, GroupParticipant[]>>(new Map());
  const [loadingGroupParticipants, setLoadingGroupParticipants] = useState<Set<string>>(new Set());

  // Import Sub-state
  const [importMode, setImportMode] = useState<'paste' | 'file'>('paste');
  const [importRawText, setImportRawText] = useState('');
  const [importParsedPreview, setImportParsedPreview] = useState<{
    totalLines: number;
    valid: Array<{ jid: string; number: string; name: string }>;
    duplicatesCount: number;
    invalidCount: number;
  } | null>(null);

  const isConnected = whatsappState.status === 'connected';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll when any modal is open
  useEffect(() => {
    if (isModalOpen || selectedResultDetails) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isModalOpen, selectedResultDetails]);

  // Check if any selected target comes from import
  const hasImportedTargets = useMemo(() => {
    return formTargets.some((t) => t.source === 'import');
  }, [formTargets]);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    if (!pickerSearch.trim()) return contacts;
    const term = pickerSearch.toLowerCase();
    return contacts.filter(
      (c) => (c.name && c.name.toLowerCase().includes(term)) || (c.number && c.number.includes(term))
    );
  }, [contacts, pickerSearch]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!pickerSearch.trim()) return groups;
    const term = pickerSearch.toLowerCase();
    return groups.filter(
      (g) => g.subject.toLowerCase().includes(term) || g.id.toLowerCase().includes(term)
    );
  }, [groups, pickerSearch]);

  // Open Modal - New
  const handleOpenNewModal = () => {
    setEditingSchedule(null);
    setFormName('');
    setFormMessage('');
    setFormFallbackName('amigo(a)');
    setFormType('once');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setFormDate(tomorrow.toISOString().split('T')[0]);
    setFormTime('08:00');
    setFormWeeklyDays([1]);
    setFormTargets([]);
    setFormIntervalSeconds(5);
    setFormBatchPauseEnabled(false);
    setFormBatchSize(5);
    setFormBatchPauseMinutes(5);
    setImportComplianceChecked(false);
    setImportRawText('');
    setImportParsedPreview(null);
    setFormError(null);
    setIsModalOpen(true);
    fetchContacts();
    fetchGroups();
  };

  // Open Modal - Edit
  const handleOpenEditModal = (schedule: ScheduledMessage) => {
    setEditingSchedule(schedule);
    setFormName(schedule.name);
    setFormMessage(schedule.message);
    setFormFallbackName(schedule.fallbackName || 'amigo(a)');
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

    if (schedule.weeklyDays && schedule.weeklyDays.length > 0) {
      setFormWeeklyDays(schedule.weeklyDays);
    } else {
      setFormWeeklyDays([1]);
    }

    setFormTargets(schedule.targets || []);
    setFormIntervalSeconds(
      Math.round((schedule.deliveryOptions?.intervalBetweenMessagesMs || 5000) / 1000)
    );
    setFormBatchPauseEnabled(Boolean(schedule.deliveryOptions?.batchPauseEnabled));
    setFormBatchSize(schedule.deliveryOptions?.batchSize || 5);
    setFormBatchPauseMinutes(
      Math.round((schedule.deliveryOptions?.batchPauseMs || 300000) / 60000)
    );
    setImportComplianceChecked(true);
    setImportRawText('');
    setImportParsedPreview(null);
    setFormError(null);
    setIsModalOpen(true);
    fetchContacts();
    fetchGroups();
  };

  // Toggle group participant expansion
  const handleToggleGroupParticipants = async (groupJid: string) => {
    const next = new Set(expandedGroupJids);
    if (next.has(groupJid)) {
      next.delete(groupJid);
      setExpandedGroupJids(next);
      return;
    }

    next.add(groupJid);
    setExpandedGroupJids(next);

    if (!groupParticipantsMap.has(groupJid)) {
      setLoadingGroupParticipants((prev) => new Set(prev).add(groupJid));
      const res = await fetchGroupParticipants(groupJid);
      setLoadingGroupParticipants((prev) => {
        const updated = new Set(prev);
        updated.delete(groupJid);
        return updated;
      });

      if (res && Array.isArray(res.participants)) {
        setGroupParticipantsMap((prev) => new Map(prev).set(groupJid, res.participants));
      }
    }
  };

  // Add individual contact target
  const handleToggleContactTarget = (contact: KnownContact) => {
    setFormTargets((prev) => {
      const exists = prev.some((t) => t.jid === contact.jid);
      if (exists) {
        return prev.filter((t) => t.jid !== contact.jid);
      }
      return [
        ...prev,
        {
          type: 'person',
          jid: contact.jid,
          label: contact.name || `+${contact.number || contact.jid.split('@')[0]}`,
          name: contact.name || undefined,
          source: contact.source,
        },
      ];
    });
  };

  // Add group participant target
  const handleToggleGroupParticipantTarget = (
    participant: GroupParticipant,
    groupName: string
  ) => {
    if (!participant.selectable) return;
    setFormTargets((prev) => {
      const exists = prev.some((t) => t.jid === participant.jid);
      if (exists) {
        return prev.filter((t) => t.jid !== participant.jid);
      }
      return [
        ...prev,
        {
          type: 'person',
          jid: participant.jid,
          label: `${participant.name || `+${participant.number}`} (${groupName})`,
          name: participant.name || undefined,
          source: 'group_member',
        },
      ];
    });
  };

  // Add whole group target
  const handleToggleGroupTarget = (group: WhatsAppGroup) => {
    setFormTargets((prev) => {
      const exists = prev.some((t) => t.jid === group.id);
      if (exists) {
        return prev.filter((t) => t.jid !== group.id);
      }
      return [
        ...prev,
        {
          type: 'group',
          jid: group.id,
          label: `Grupo: ${group.subject}`,
          name: group.subject,
          source: 'chat',
        },
      ];
    });
  };

  // Add manual number target
  const handleAddManualNumber = () => {
    if (!manualNumberInput.trim()) return;

    let clean = manualNumberInput.trim().replace(/\D/g, '');
    if (clean.length < 10) {
      setFormError('Número inválido. Informe DDD + número (ex: 11999998888).');
      return;
    }

    if (clean.length === 10 || clean.length === 11) {
      clean = `55${clean}`;
    }

    const jid = `${clean}@s.whatsapp.net`;
    const label = manualNameInput.trim()
      ? `${manualNameInput.trim()} (+${clean})`
      : `+${clean}`;

    setFormTargets((prev) => {
      if (prev.some((t) => t.jid === jid)) {
        return prev;
      }
      return [
        ...prev,
        {
          type: 'person',
          jid,
          label,
          name: manualNameInput.trim() || undefined,
          source: 'manual',
        },
      ];
    });

    setManualNumberInput('');
    setManualNameInput('');
    setFormError(null);
  };

  // Remove target
  const handleRemoveTarget = (jid: string) => {
    setFormTargets((prev) => prev.filter((t) => t.jid !== jid));
  };

  // Parser for importing list (text / CSV)
  const parseImportText = (raw: string) => {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const validMap = new Map<string, { jid: string; number: string; name: string }>();
    let duplicates = 0;
    let invalid = 0;

    for (const line of lines) {
      // Split by comma, semicolon, tab or pipe
      const parts = line.split(/[,;\t|]+/).map((p) => p.trim());
      const firstPart = parts[0] || '';
      const secondPart = parts[1] || '';

      // Check which part has digits
      let digits = firstPart.replace(/\D/g, '');
      let nameCandidate = secondPart;

      if (!digits && secondPart) {
        digits = secondPart.replace(/\D/g, '');
        nameCandidate = firstPart;
      }

      if (digits.length >= 10 && digits.length <= 15) {
        if (digits.length === 10 || digits.length === 11) {
          digits = `55${digits}`;
        }
        const jid = `${digits}@s.whatsapp.net`;
        const name = nameCandidate || `+${digits}`;

        if (validMap.has(jid)) {
          duplicates++;
        } else {
          validMap.set(jid, { jid, number: digits, name });
        }
      } else {
        invalid++;
      }
    }

    const valid = Array.from(validMap.values());
    setImportParsedPreview({
      totalLines: lines.length,
      valid,
      duplicatesCount: duplicates,
      invalidCount: invalid,
    });
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setImportRawText(text);
        parseImportText(text);
      }
    };
    reader.readAsText(file);
  };

  const handleApplyImportedTargets = () => {
    if (!importParsedPreview || importParsedPreview.valid.length === 0) return;

    setFormTargets((prev) => {
      const existingJids = new Set(prev.map((t) => t.jid));
      const additions: ScheduledTarget[] = [];

      for (const item of importParsedPreview.valid) {
        if (!existingJids.has(item.jid)) {
          existingJids.add(item.jid);
          additions.push({
            type: 'person',
            jid: item.jid,
            label: item.name !== `+${item.number}` ? `${item.name} (+${item.number})` : `+${item.number}`,
            name: item.name !== `+${item.number}` ? item.name : undefined,
            source: 'import',
          });
        }
      }
      return [...prev, ...additions];
    });

    setImportRawText('');
    setImportParsedPreview(null);
    setPickerTab('pessoas');
  };

  // Form Submit
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError('Informe um nome para o agendamento.');
      return;
    }

    if (!formMessage.trim()) {
      setFormError('Informe a mensagem a ser enviada.');
      return;
    }

    if (formTargets.length === 0) {
      setFormError('Selecione pelo menos um destinatário (Pessoa, Grupo ou Importado).');
      return;
    }

    if (hasImportedTargets && !importComplianceChecked) {
      setFormError(
        'Você incluiu destinatários importados. É obrigatório confirmar a autorização de envio.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const scheduledAtIso =
        formType === 'once'
          ? new Date(`${formDate}T${formTime}:00`).toISOString()
          : new Date().toISOString();

      const deliveryOptions: DeliveryOptions = {
        intervalBetweenMessagesMs: Math.max(1000, formIntervalSeconds * 1000),
        batchPauseEnabled: formBatchPauseEnabled,
        batchSize: Math.max(1, formBatchSize),
        batchPauseMs: Math.max(5000, formBatchPauseMinutes * 60000),
      };

      if (editingSchedule) {
        const res = await updateSchedule(editingSchedule.id, {
          name: formName.trim(),
          message: formMessage.trim(),
          targets: formTargets,
          scheduleType: formType,
          scheduledAt: scheduledAtIso,
          timeOfDay: formTime,
          weeklyDays: formWeeklyDays,
          fallbackName: formFallbackName.trim() || 'amigo(a)',
          deliveryOptions,
        });

        if (!res.success) {
          setFormError(res.error || 'Erro ao atualizar agendamento.');
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createSchedule({
          name: formName.trim(),
          message: formMessage.trim(),
          targets: formTargets,
          scheduleType: formType,
          scheduledAt: scheduledAtIso,
          timeOfDay: formTime,
          weeklyDays: formWeeklyDays,
          fallbackName: formFallbackName.trim() || 'amigo(a)',
          deliveryOptions,
        });

        if (!res.success) {
          setFormError(res.error || 'Erro ao criar agendamento.');
          setIsSubmitting(false);
          return;
        }
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao processar agendamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSourceBadge = (source?: string) => {
    switch (source) {
      case 'history':
        return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Histórico</span>;
      case 'message':
        return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Mensagem</span>;
      case 'contact':
        return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">Contato</span>;
      case 'import':
        return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Importado</span>;
      case 'group_member':
        return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Membro Grupo</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/60 p-6 rounded-2xl border border-neutral-800">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-emerald-400" />
            Agendamentos de Mensagens
          </h2>
          <p className="text-neutral-400 text-sm mt-1">
            Envio automático pontual ou recorrente com controle de ritmo, templates e personalização.
          </p>
        </div>

        <button
          id="btn-novo-agendamento"
          onClick={handleOpenNewModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-neutral-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/10"
        >
          <Plus className="w-4 h-4" />
          Novo Agendamento
        </button>
      </div>

      {/* Real-time Execution Banner */}
      {currentProgress && (
        <div className="bg-neutral-900 border border-emerald-500/30 rounded-2xl p-5 shadow-xl relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                {currentProgress.status === 'batch_pause' ? (
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-pulse">
                    <Timer className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{currentProgress.scheduleName}</span>
                  {currentProgress.status === 'batch_pause' ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      Pausa de Lote Ativa
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Em Execução Real
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {currentProgress.status === 'batch_pause'
                    ? `Pausa de segurança para resfriamento de fila. Retomada prevista para ${
                        currentProgress.resumeAt
                          ? new Date(currentProgress.resumeAt).toLocaleTimeString('pt-BR')
                          : 'em breve'
                      }.`
                    : `Enviando para: ${currentProgress.targetLabel} (${currentProgress.currentIndex}/${currentProgress.totalTargets})`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-400 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                ✓ {currentProgress.sentCount} enviados
              </span>
              {currentProgress.failedCount > 0 && (
                <span className="text-rose-400 font-medium bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20">
                  ✗ {currentProgress.failedCount} falhas
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-neutral-800 rounded-full h-1.5 mt-4 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                currentProgress.status === 'batch_pause' ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{
                width: `${Math.round(
                  (currentProgress.currentIndex / Math.max(1, currentProgress.totalTargets)) * 100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Schedules List */}
      {loadingSchedules ? (
        <div className="flex items-center justify-center p-12 text-neutral-500 gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          <span>Carregando agendamentos...</span>
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 px-4 bg-neutral-900/40 rounded-3xl border border-neutral-800/80">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-neutral-800/80 flex items-center justify-center text-neutral-400 mb-4">
            <Calendar className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-semibold text-white">Nenhum agendamento ativo</h3>
          <p className="text-neutral-400 text-sm max-w-sm mx-auto mt-1 mb-6">
            Crie disparos programados para contatos individuais, membros de grupos ou listas importadas.
          </p>
          <button
            onClick={handleOpenNewModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar Primeiro Agendamento
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {schedules.map((schedule) => {
            const isRunning = executingScheduleId === schedule.id || schedule.status === 'running';

            return (
              <div
                key={schedule.id}
                className="bg-neutral-900/80 border border-neutral-800 hover:border-neutral-700/80 rounded-2xl p-5 transition-all shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Info Header */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-base font-semibold text-white truncate">
                        {schedule.name}
                      </h3>

                      {/* Status Badge */}
                      {isRunning ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Executando
                        </span>
                      ) : schedule.status === 'paused' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Pause className="w-3 h-3" />
                          Pausado
                        </span>
                      ) : schedule.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Concluído
                        </span>
                      ) : schedule.status === 'error' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle className="w-3 h-3" />
                          Falhou
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-800 text-neutral-300 border border-neutral-700">
                          <Clock className="w-3 h-3 text-emerald-400" />
                          Agendado
                        </span>
                      )}

                      {/* Type Badge */}
                      <span className="px-2 py-0.5 text-xs rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700/50">
                        {schedule.scheduleType === 'once'
                          ? 'Único'
                          : schedule.scheduleType === 'daily'
                          ? 'Diário'
                          : 'Semanal'}
                      </span>
                    </div>

                    {/* Message Preview */}
                    <p className="text-sm text-neutral-300 font-mono bg-neutral-950/60 p-2.5 rounded-xl border border-neutral-800/80 line-clamp-2">
                      {schedule.message}
                    </p>

                    {/* Meta details */}
                    <div className="flex items-center gap-4 text-xs text-neutral-400 flex-wrap pt-1">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-neutral-500" />
                        {schedule.targets.length} {schedule.targets.length === 1 ? 'destinatário' : 'destinatários'}
                      </span>

                      {schedule.nextRunAt && schedule.status === 'active' && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Clock className="w-3.5 h-3.5" />
                          Próximo: {new Date(schedule.nextRunAt).toLocaleString('pt-BR')}
                        </span>
                      )}

                      {schedule.deliveryOptions && (
                        <span className="flex items-center gap-1 text-neutral-500">
                          <Sliders className="w-3 h-3" />
                          Intervalo: {Math.round(schedule.deliveryOptions.intervalBetweenMessagesMs / 1000)}s
                          {schedule.deliveryOptions.batchPauseEnabled &&
                            ` | Lote de ${schedule.deliveryOptions.batchSize}`}
                        </span>
                      )}

                      {schedule.lastResult && (
                        <button
                          onClick={() =>
                            setSelectedResultDetails({
                              scheduleName: schedule.name,
                              result: schedule.lastResult!,
                            })
                          }
                          className="text-xs text-emerald-400 hover:text-emerald-300 underline font-medium"
                        >
                          Ver relatório do último disparo ({schedule.lastResult.sentCount} enviados)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-neutral-800">
                    <button
                      id={`btn-run-now-${schedule.id}`}
                      onClick={() => runNow(schedule.id)}
                      disabled={isRunning || !isConnected}
                      title="Disparar Agora"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isRunning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      Run Now
                    </button>

                    {schedule.status === 'active' ? (
                      <button
                        onClick={() => pauseSchedule(schedule.id)}
                        disabled={isRunning}
                        title="Pausar Agendamento"
                        className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    ) : schedule.status === 'paused' ? (
                      <button
                        onClick={() => resumeSchedule(schedule.id)}
                        disabled={isRunning}
                        title="Retomar Agendamento"
                        className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs transition-colors"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                    ) : null}

                    <button
                      onClick={() => handleOpenEditModal(schedule)}
                      disabled={isRunning}
                      title="Editar"
                      className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`Tem certeza que deseja excluir "${schedule.name}"?`)) {
                          deleteSchedule(schedule.id);
                        }
                      }}
                      disabled={isRunning}
                      title="Excluir"
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs transition-colors"
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

      {/* Modal: Novo / Editar Agendamento (Strict UX Architecture) */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-hidden p-4 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsModalOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] flex flex-col bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-neutral-800 shrink-0 bg-neutral-900">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  {editingSchedule ? 'Editar Agendamento' : 'Novo Agendamento'}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Configure mensagem, destinatários e ritmo de entrega.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form id="schedule-form" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-6">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Nome do Agendamento */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  1. Nome da Campanha / Agendamento
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Mensagem Boas Vindas, Lembrete Reunião..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* 2. Mensagem & Personalização ({nome}) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    2. Mensagem & Personalização
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormMessage((prev) => `${prev} {nome}`)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-500/20 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    + Inserir {'{nome}'}
                  </button>
                </div>

                <textarea
                  required
                  rows={4}
                  placeholder="Digite sua mensagem. Use {nome} para incluir o nome do destinatário automaticamente..."
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors font-sans"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">
                      Substituto quando o nome não for identificado:
                    </label>
                    <input
                      type="text"
                      placeholder="amigo(a)"
                      value={formFallbackName}
                      onChange={(e) => setFormFallbackName(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Dynamic Template Preview Box */}
                  <div className="bg-neutral-950/80 p-3 rounded-xl border border-neutral-800/80">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                      Preview dinâmico:
                    </span>
                    <p className="text-xs text-emerald-300 font-mono italic whitespace-pre-wrap line-clamp-3">
                      {formMessage
                        ? renderMessageTemplate(formMessage, { jid: 'preview', name: 'João Silva' }, formFallbackName)
                        : 'Sua mensagem renderizada aparecerá aqui...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Destinatários Tabs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    3. Destinatários ({formTargets.length} selecionados)
                  </label>
                  {formTargets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFormTargets([])}
                      className="text-xs text-neutral-500 hover:text-rose-400 transition-colors"
                    >
                      Limpar todos
                    </button>
                  )}
                </div>

                {/* Selected Targets Chips */}
                {formTargets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-neutral-950 border border-neutral-800 max-h-32 overflow-y-auto">
                    {formTargets.map((t) => (
                      <span
                        key={t.jid}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-neutral-900 border border-neutral-700 text-neutral-200"
                      >
                        {t.type === 'group' ? (
                          <Users className="w-3 h-3 text-indigo-400 shrink-0" />
                        ) : (
                          <User className="w-3 h-3 text-emerald-400 shrink-0" />
                        )}
                        <span className="max-w-[150px] truncate">{t.label}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTarget(t.jid)}
                          className="hover:text-rose-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Picker Tabs */}
                <div className="bg-neutral-950 p-3 rounded-2xl border border-neutral-800 space-y-3">
                  <div className="flex rounded-xl bg-neutral-900 p-1 border border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setPickerTab('pessoas')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        pickerTab === 'pessoas'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                      Pessoas ({contacts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerTab('grupos')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        pickerTab === 'grupos'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      Grupos ({groups.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerTab('importar')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        pickerTab === 'importar'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Importar Lista
                    </button>
                  </div>

                  {/* Tab 1: Pessoas */}
                  {pickerTab === 'pessoas' && (
                    <div className="space-y-3">
                      {/* Search */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="text"
                          placeholder="Buscar no diretório de pessoas..."
                          value={pickerSearch}
                          onChange={(e) => setPickerSearch(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      {/* Contacts List */}
                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                        {loadingContacts ? (
                          <div className="p-4 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                            Carregando diretório...
                          </div>
                        ) : filteredContacts.length === 0 ? (
                          <div className="p-4 text-center text-xs text-neutral-500">
                            Nenhum contato encontrado no diretório. Use o formulário abaixo para adicionar manualmente.
                          </div>
                        ) : (
                          filteredContacts.map((contact) => {
                            const isSelected = formTargets.some((t) => t.jid === contact.jid);
                            return (
                              <div
                                key={contact.jid}
                                onClick={() => handleToggleContactTarget(contact)}
                                className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer border transition-colors ${
                                  isSelected
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                                    : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="rounded border-neutral-700 bg-neutral-950 text-emerald-500 focus:ring-0"
                                  />
                                  <div className="truncate">
                                    <span className="font-medium text-white block truncate">
                                      {contact.name || `+${contact.number}`}
                                    </span>
                                    {contact.number && (
                                      <span className="text-[11px] text-neutral-500 block">
                                        +{contact.number}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {getSourceBadge(contact.source)}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Manual Number Entry */}
                      <div className="pt-2 border-t border-neutral-800/80">
                        <span className="text-[11px] text-neutral-400 font-medium block mb-2">
                          Adicionar número avulso manualmente:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder="DDD + Número (ex: 93991234567)"
                            value={manualNumberInput}
                            onChange={(e) => setManualNumberInput(e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white"
                          />
                          <input
                            type="text"
                            placeholder="Nome (opcional)"
                            value={manualNameInput}
                            onChange={(e) => setManualNameInput(e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white"
                          />
                          <button
                            type="button"
                            onClick={handleAddManualNumber}
                            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 font-medium rounded-xl text-xs transition-colors border border-neutral-700"
                          >
                            + Adicionar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Grupos & Membros */}
                  {pickerTab === 'grupos' && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="text"
                          placeholder="Buscar grupos..."
                          value={pickerSearch}
                          onChange={(e) => setPickerSearch(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                        {loadingGroups ? (
                          <div className="p-4 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                            Carregando grupos...
                          </div>
                        ) : filteredGroups.length === 0 ? (
                          <div className="p-4 text-center text-xs text-neutral-500">
                            Nenhum grupo encontrado.
                          </div>
                        ) : (
                          filteredGroups.map((group) => {
                            const isGroupSelected = formTargets.some((t) => t.jid === group.id);
                            const isExpanded = expandedGroupJids.has(group.id);
                            const participants = groupParticipantsMap.get(group.id) || [];
                            const isLoadingParticipants = loadingGroupParticipants.has(group.id);

                            return (
                              <div
                                key={group.id}
                                className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div
                                    onClick={() => handleToggleGroupTarget(group)}
                                    className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isGroupSelected}
                                      onChange={() => {}}
                                      className="rounded border-neutral-700 bg-neutral-950 text-emerald-500 focus:ring-0"
                                    />
                                    <div className="truncate">
                                      <span className="font-semibold text-white text-xs block truncate">
                                        {group.subject}
                                      </span>
                                      <span className="text-[10px] text-neutral-500">
                                        {group.participantsCount} participantes
                                      </span>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleGroupParticipants(group.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] transition-colors shrink-0"
                                  >
                                    {isLoadingParticipants ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : isExpanded ? (
                                      <ChevronUp className="w-3 h-3" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3" />
                                    )}
                                    {isExpanded ? 'Ocultar membros' : 'Selecionar membros'}
                                  </button>
                                </div>

                                {/* Expanded Group Participants */}
                                {isExpanded && (
                                  <div className="pt-2 border-t border-neutral-800/80 pl-6 space-y-1.5 max-h-40 overflow-y-auto">
                                    {isLoadingParticipants ? (
                                      <div className="py-2 text-center text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
                                        <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                                        Obtendo membros do grupo...
                                      </div>
                                    ) : participants.length === 0 ? (
                                      <div className="text-[11px] text-neutral-500">
                                        Nenhum participante legível retornado.
                                      </div>
                                    ) : (
                                      participants.map((p) => {
                                        const isMemberSelected = formTargets.some((t) => t.jid === p.jid);

                                        return (
                                          <div
                                            key={p.jid}
                                            onClick={() => {
                                              if (p.selectable) {
                                                handleToggleGroupParticipantTarget(p, group.subject);
                                              }
                                            }}
                                            className={`flex items-center justify-between p-1.5 rounded-lg text-[11px] ${
                                              !p.selectable
                                                ? 'opacity-40 cursor-not-allowed bg-neutral-950/40 text-neutral-500'
                                                : isMemberSelected
                                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 cursor-pointer'
                                                : 'hover:bg-neutral-800 text-neutral-300 cursor-pointer'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 truncate">
                                              <input
                                                type="checkbox"
                                                disabled={!p.selectable}
                                                checked={isMemberSelected}
                                                onChange={() => {}}
                                                className="rounded border-neutral-700 bg-neutral-950 text-emerald-500 focus:ring-0"
                                              />
                                              <span className="truncate">{p.name || `+${p.number}`}</span>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                              {p.isAdmin && (
                                                <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-400 rounded">
                                                  Admin
                                                </span>
                                              )}
                                              {!p.selectable && (
                                                <span className="text-[9px] text-neutral-500">
                                                  Telefone não resolvido
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tab 3: Importar Lista */}
                  {pickerTab === 'importar' && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setImportMode('paste')}
                          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                            importMode === 'paste'
                              ? 'bg-neutral-800 text-white'
                              : 'text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          Colar Texto / CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportMode('file')}
                          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                            importMode === 'file'
                              ? 'bg-neutral-800 text-white'
                              : 'text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          Upload de Arquivo
                        </button>
                      </div>

                      {importMode === 'paste' ? (
                        <div className="space-y-2">
                          <textarea
                            rows={4}
                            placeholder="Cole números (um por linha) ou no formato: 93991234567,Nome do Cliente"
                            value={importRawText}
                            onChange={(e) => {
                              setImportRawText(e.target.value);
                              parseImportText(e.target.value);
                            }}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-neutral-800 rounded-xl p-6 text-center">
                          <input
                            type="file"
                            ref={fileInputRef}
                            accept=".csv,.txt"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium"
                          >
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                            Selecionar Arquivo .CSV ou .TXT
                          </button>
                          <p className="text-[11px] text-neutral-500 mt-2">
                            Formato aceito: linhas com número ou número,nome
                          </p>
                        </div>
                      )}

                      {/* Import Preview Summary */}
                      {importParsedPreview && (
                        <div className="bg-neutral-900 p-3 rounded-xl border border-neutral-800 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-white">Resumo da Importação:</span>
                            <span className="text-emerald-400 font-bold">
                              {importParsedPreview.valid.length} válidos
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-[11px] text-neutral-400">
                            <div>Lidos: {importParsedPreview.totalLines}</div>
                            <div>Duplicados: {importParsedPreview.duplicatesCount}</div>
                            <div>Inválidos: {importParsedPreview.invalidCount}</div>
                          </div>

                          <button
                            type="button"
                            onClick={handleApplyImportedTargets}
                            disabled={importParsedPreview.valid.length === 0}
                            className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-neutral-950 font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2"
                          >
                            ADICIONAR {importParsedPreview.valid.length} DESTINATÁRIOS
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Mandatory compliance checkbox for imported contacts */}
                {hasImportedTargets && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="compliance-checkbox"
                      required
                      checked={importComplianceChecked}
                      onChange={(e) => setImportComplianceChecked(e.target.checked)}
                      className="mt-0.5 rounded border-amber-600 bg-neutral-950 text-amber-500 focus:ring-0"
                    />
                    <label htmlFor="compliance-checkbox" className="text-xs text-amber-300 leading-tight">
                      <strong className="block font-semibold">Termo de Conformidade e Consentimento:</strong>
                      Confirmo que possuo autorização prévia e base legal para contatar os destinatários importados.
                    </label>
                  </div>
                )}
              </div>

              {/* 4. Frequência & Horário */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  4. Frequência & Horário
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {(['once', 'daily', 'weekly'] as ScheduleType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormType(type)}
                      className={`py-2 rounded-xl text-xs font-semibold transition-all border ${
                        formType === type
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:bg-neutral-800'
                      }`}
                    >
                      {type === 'once' ? 'Uma Vez' : type === 'daily' ? 'Diário' : 'Semanal'}
                    </button>
                  ))}
                </div>

                {/* Date & Time Picker */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                  {formType === 'once' ? (
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Data do Disparo:</label>
                      <input
                        type="date"
                        required
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Horário do Disparo:</label>
                    <input
                      type="time"
                      required
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {formType === 'weekly' && (
                    <div className="sm:col-span-2 space-y-1.5 pt-2 border-t border-neutral-800">
                      <label className="block text-xs text-neutral-400">Dias da Semana:</label>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEK_DAYS.map((d) => {
                          const isSelected = formWeeklyDays.includes(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => {
                                setFormWeeklyDays((prev) => {
                                  if (prev.includes(d.id)) {
                                    if (prev.length === 1) return prev; // keep at least one
                                    return prev.filter((id) => id !== d.id);
                                  }
                                  return [...prev, d.id];
                                });
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                                isSelected
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800'
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Controle de Ritmo e Pausa de Lote */}
              <div className="space-y-3 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  5. Controle de Ritmo & Fila de Entrega
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      Intervalo entre mensagens (segundos):
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={formIntervalSeconds}
                      onChange={(e) => setFormIntervalSeconds(parseInt(e.target.value, 10) || 5)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer pb-2">
                      <input
                        type="checkbox"
                        checked={formBatchPauseEnabled}
                        onChange={(e) => setFormBatchPauseEnabled(e.target.checked)}
                        className="rounded border-neutral-700 bg-neutral-950 text-emerald-500 focus:ring-0"
                      />
                      <span className="text-xs text-neutral-300 font-medium">
                        Ativar pausa após lote de disparos
                      </span>
                    </label>
                  </div>
                </div>

                {formBatchPauseEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80 animate-in fade-in duration-200">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">
                        A cada quantas mensagens:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={formBatchSize}
                        onChange={(e) => setFormBatchSize(parseInt(e.target.value, 10) || 5)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">
                        Pausar por quantos minutos:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={formBatchPauseMinutes}
                        onChange={(e) =>
                          setFormBatchPauseMinutes(parseInt(e.target.value, 10) || 5)
                        }
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </form>

            {/* Modal Footer (Always Anchored at Bottom) */}
            <div className="flex items-center justify-end gap-3 p-4 px-6 border-t border-neutral-800 shrink-0 bg-neutral-900/90 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="schedule-form"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-neutral-950 text-xs font-bold transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {editingSchedule ? 'Atualizar Agendamento' : 'Salvar Agendamento'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Relatório de Execução / Detalhes de Disparo */}
      {selectedResultDetails && (
        <div
          className="fixed inset-0 z-50 overflow-hidden p-4 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedResultDetails(null)}
        >
          <div
            className="w-full max-w-xl max-h-[calc(100dvh-2rem)] flex flex-col bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 pb-4 border-b border-neutral-800 shrink-0">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Relatório do Disparo: {selectedResultDetails.scheduleName}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Executado em {new Date(selectedResultDetails.result.executedAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <button
                onClick={() => setSelectedResultDetails(null)}
                className="p-2 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                  <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Total</span>
                  <span className="text-base font-bold text-white">
                    {selectedResultDetails.result.totalTargets}
                  </span>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Enviados</span>
                  <span className="text-base font-bold text-emerald-400">
                    {selectedResultDetails.result.sentCount}
                  </span>
                </div>
                <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
                  <span className="text-[10px] text-rose-400 uppercase font-semibold block">Falhas</span>
                  <span className="text-base font-bold text-rose-400">
                    {selectedResultDetails.result.failedCount}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-neutral-300 block">
                  Destinatários do lote:
                </span>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedResultDetails.result.details.map((detail, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-neutral-950 rounded-xl border border-neutral-800/80 space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white truncate max-w-[250px]">
                          {detail.targetLabel}
                        </span>
                        {detail.status === 'sent' ? (
                          <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                            <CheckCircle2 className="w-3 h-3" /> Enviado
                          </span>
                        ) : detail.status === 'skipped' ? (
                          <span className="text-amber-400 flex items-center gap-1 text-[11px]">
                            <AlertCircle className="w-3 h-3" /> Ignorado
                          </span>
                        ) : (
                          <span className="text-rose-400 flex items-center gap-1 text-[11px]">
                            <XCircle className="w-3 h-3" /> {detail.error || 'Falhou'}
                          </span>
                        )}
                      </div>

                      {detail.renderedPreview && (
                        <p className="text-[11px] text-neutral-400 font-mono italic whitespace-pre-wrap bg-neutral-900/50 p-2 rounded-lg border border-neutral-800">
                          {detail.renderedPreview}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-neutral-800 shrink-0 flex justify-end">
              <button
                onClick={() => setSelectedResultDetails(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold"
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
