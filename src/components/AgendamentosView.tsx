import { useState, useMemo, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit2,
  Copy,
  Users,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Search,
  X,
  Sparkles,
  FileSpreadsheet,
  Upload,
  ChevronDown,
  ChevronUp,
  Timer,
  Sliders,
  Check,
  Image as ImageIcon,
  Link2,
  Eye,
  ExternalLink,
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
  ScheduledMedia,
  WeeklyTimeSlot,
} from '../types';
import { useSchedules } from '../hooks/useSchedules';
import { useInstances } from '../contexts/InstancesContext';
import { renderMessageTemplate } from '../utils/template';
import { Button } from './ui/Button';

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
  const { selectedInstanceId } = useInstances();
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
    uploadMedia,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    pauseSchedule,
    resumeSchedule,
    runNow,
    schedulerTimezone,
  } = useSchedules(selectedInstanceId);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledMessage | null>(null);
  const [selectedResultDetails, setSelectedResultDetails] = useState<{
    scheduleName: string;
    result: ScheduleLastResult;
  } | null>(null);
  const [previewMediaModal, setPreviewMediaModal] = useState<ScheduledMedia | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<ScheduledMessage | null>(null);
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);

  // Form Basic Info
  const [formName, setFormName] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formFallbackName, setFormFallbackName] = useState('amigo(a)');
  const [formType, setFormType] = useState<ScheduleType>('once');

  // Form Once Timing
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('08:00');

  // Form Daily Multi-slot Timing
  const [formDailyTimes, setFormDailyTimes] = useState<string[]>(['08:00']);
  const [newDailyTimeInput, setNewDailyTimeInput] = useState('14:00');

  // Form Weekly Multi-slot Timing
  const [formWeeklyDays, setFormWeeklyDays] = useState<number[]>([1]); // Seg
  const [formWeeklySlots, setFormWeeklySlots] = useState<WeeklyTimeSlot[]>([
    { day: 1, times: ['08:00'] },
  ]);
  const [selectedWeeklyDayForTimes, setSelectedWeeklyDayForTimes] = useState<number>(1);
  const [newWeeklyTimeInput, setNewWeeklyTimeInput] = useState('14:00');

  // Form Media State
  const [formMedia, setFormMedia] = useState<ScheduledMedia | null>(null);
  const [mediaTab, setMediaTab] = useState<'upload' | 'url'>('upload');
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Form Targets
  const [formTargets, setFormTargets] = useState<ScheduledTarget[]>([]);

  // Form Delivery Rhythm Options
  const [formIntervalSeconds, setFormIntervalSeconds] = useState(5);
  const [formBatchPauseEnabled, setFormBatchPauseEnabled] = useState(false);
  const [formBatchSize, setFormBatchSize] = useState(5);
  const [formBatchPauseMinutes, setFormBatchPauseMinutes] = useState(5);

  // Form Compliance Checkbox for imported numbers
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
  const mediaFileInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll when any modal is open
  useEffect(() => {
    if (isModalOpen || selectedResultDetails || previewMediaModal || scheduleToDelete) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isModalOpen, selectedResultDetails, previewMediaModal, scheduleToDelete]);

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

  // Reset & Open Modal - New
  const handleOpenNewModal = () => {
    setEditingSchedule(null);
    setFormName('');
    setFormMessage('');
    setFormFallbackName('amigo(a)');
    setFormType('once');

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: schedulerTimezone,
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const dict = parts.reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {} as Record<string, string>);
    setFormDate(`${dict.year}-${dict.month}-${dict.day}`);

    setFormTime('08:00');

    setFormDailyTimes(['08:00']);
    setFormWeeklyDays([1]);
    setFormWeeklySlots([{ day: 1, times: ['08:00'] }]);
    setSelectedWeeklyDayForTimes(1);

    setFormMedia(null);
    setMediaUrlInput('');
    setMediaError(null);
    setMediaTab('upload');

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

  const hydrateScheduleForm = (schedule: ScheduledMessage) => {
    setFormName(schedule.name);
    setFormMessage(schedule.message || '');
    setFormFallbackName(schedule.fallbackName || 'amigo(a)');
    setFormType(schedule.scheduleType);

    if (schedule.scheduledAt) {
      const dt = new Date(schedule.scheduledAt);
      if (!isNaN(dt.getTime())) {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: schedulerTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).formatToParts(dt);
        
        const dict = parts.reduce((acc, part) => {
          acc[part.type] = part.value;
          return acc;
        }, {} as Record<string, string>);
        
        setFormDate(`${dict.year}-${dict.month}-${dict.day}`);
        // Ensure time defaults to 24-hour hour and minute
        const hour = dict.hour === '24' ? '00' : dict.hour;
        setFormTime(`${hour}:${dict.minute}`);
      }
    }

    // Daily times parsing
    if (schedule.dailyTimes && schedule.dailyTimes.length > 0) {
      setFormDailyTimes([...schedule.dailyTimes]);
    } else {
      setFormDailyTimes([]);
    }

    // Weekly slots parsing
    if (schedule.weeklyTimeSlots && schedule.weeklyTimeSlots.length > 0) {
      const clonedSlots = schedule.weeklyTimeSlots.map(s => ({ day: s.day, times: [...s.times] }));
      setFormWeeklySlots(clonedSlots);
      const days = clonedSlots.map((s) => s.day);
      setFormWeeklyDays(days);
      setSelectedWeeklyDayForTimes(days[0] ?? 1);
    } else {
      setFormWeeklyDays([]);
      setFormWeeklySlots([]);
      setSelectedWeeklyDayForTimes(1);
    }

    // Media
    if (schedule.media) {
      setFormMedia({ ...schedule.media });
      if (schedule.media.source === 'url') {
        setMediaTab('url');
        setMediaUrlInput(schedule.media.url || '');
      } else {
        setMediaTab('upload');
        setMediaUrlInput('');
      }
    } else {
      setFormMedia(null);
      setMediaUrlInput('');
      setMediaTab('upload');
    }
    setMediaError(null);

    setFormTargets([...(schedule.targets || [])]);

    setFormIntervalSeconds(
      Math.round((schedule.deliveryOptions?.intervalBetweenMessagesMs || 5000) / 1000)
    );
    setFormBatchPauseEnabled(Boolean(schedule.deliveryOptions?.batchPauseEnabled));
    setFormBatchSize(schedule.deliveryOptions?.batchSize || 5);
    setFormBatchPauseMinutes(
      Math.round((schedule.deliveryOptions?.batchPauseMs || 300000) / 60000)
    );

    setImportRawText('');
    setImportParsedPreview(null);
    setFormError(null);
  };

  // Open Modal - Edit
  const handleOpenEditModal = (schedule: ScheduledMessage) => {
    setEditingSchedule(schedule);
    hydrateScheduleForm(schedule);
    setImportComplianceChecked(true);
    setIsModalOpen(true);
    fetchContacts();
    fetchGroups();
  };

  // Open Modal - Duplicate
  const handleOpenDuplicateModal = (schedule: ScheduledMessage) => {
    setEditingSchedule(null);
    hydrateScheduleForm(schedule);
    setFormName(`${schedule.name} (cópia)`);
    
    // Check if ONCE scheduledAt is in the past
    if (schedule.scheduleType === 'once' && schedule.scheduledAt) {
      const dt = new Date(schedule.scheduledAt);
      if (dt.getTime() <= Date.now()) {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: schedulerTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).formatToParts(new Date());
        const dict = parts.reduce((acc, part) => {
          acc[part.type] = part.value;
          return acc;
        }, {} as Record<string, string>);
        
        setFormDate(`${dict.year}-${dict.month}-${dict.day}`);
        setFormTime('');
      }
    }

    setImportComplianceChecked(false);
    setIsModalOpen(true);
    fetchContacts();
    fetchGroups();
  };

  // Media Upload Handler
  const handleMediaFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    if (file.size > 10 * 1024 * 1024) {
      setMediaError('A imagem não pode ultrapassar 10 MB.');
      return;
    }

    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type)) {
      setMediaError('Formato inválido. Envie JPG, PNG ou WebP.');
      return;
    }

    setMediaUploading(true);
    setMediaError(null);

    const res = await uploadMedia(file);
    setMediaUploading(false);

    if (res.success && res.media) {
      setFormMedia(res.media);
      if (mediaFileInputRef.current) {
        mediaFileInputRef.current.value = '';
      }
    } else {
      setMediaError(res.error || 'Falha ao processar upload da imagem.');
    }
  };

  // Media URL Handler
  const handleApplyMediaUrl = () => {
    if (!mediaUrlInput.trim()) {
      setMediaError('Informe uma URL de imagem válida.');
      return;
    }

    const url = mediaUrlInput.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setMediaError('A URL deve começar com http:// ou https://');
      return;
    }

    setFormMedia({
      type: 'image',
      source: 'url',
      url,
      fileName: url.split('/').pop()?.split('?')[0] || 'imagem_web.jpg',
      mimeType: 'image/jpeg',
    });
    setMediaError(null);
  };

  // Remove Media
  const handleRemoveMedia = () => {
    setFormMedia(null);
    setMediaUrlInput('');
    setMediaError(null);
  };

  // Daily Times Management
  const handleAddDailyTime = () => {
    if (!newDailyTimeInput || !newDailyTimeInput.match(/^([01]\d|2[0-3]):[0-5]\d$/)) {
      return;
    }
    if (!formDailyTimes.includes(newDailyTimeInput)) {
      const updated = [...formDailyTimes, newDailyTimeInput].sort();
      setFormDailyTimes(updated);
    }
  };

  const handleRemoveDailyTime = (timeToRemove: string) => {
    if (formDailyTimes.length <= 1) {
      setFormError('É necessário manter pelo menos um horário de envio diário.');
      return;
    }
    setFormDailyTimes(formDailyTimes.filter((t) => t !== timeToRemove));
  };

  // Weekly Days & Slots Management
  const handleToggleWeeklyDay = (dayId: number) => {
    let nextDays: number[];
    if (formWeeklyDays.includes(dayId)) {
      if (formWeeklyDays.length <= 1) return; // Keep at least one day
      nextDays = formWeeklyDays.filter((d) => d !== dayId);
    } else {
      nextDays = [...formWeeklyDays, dayId].sort((a, b) => a - b);
    }

    setFormWeeklyDays(nextDays);

    // Synchronize slots
    const updatedSlots = nextDays.map((d) => {
      const existing = formWeeklySlots.find((s) => s.day === d);
      return existing || { day: d, times: ['08:00'] };
    });
    setFormWeeklySlots(updatedSlots);

    if (!nextDays.includes(selectedWeeklyDayForTimes)) {
      setSelectedWeeklyDayForTimes(nextDays[0]);
    }
  };

  const handleAddWeeklyTime = (dayId: number) => {
    if (!newWeeklyTimeInput || !newWeeklyTimeInput.match(/^([01]\d|2[0-3]):[0-5]\d$/)) {
      return;
    }

    setFormWeeklySlots((prev) => {
      return prev.map((slot) => {
        if (slot.day === dayId) {
          if (!slot.times.includes(newWeeklyTimeInput)) {
            return {
              ...slot,
              times: [...slot.times, newWeeklyTimeInput].sort(),
            };
          }
        }
        return slot;
      });
    });
  };

  const handleRemoveWeeklyTime = (dayId: number, timeToRemove: string) => {
    setFormWeeklySlots((prev) => {
      return prev.map((slot) => {
        if (slot.day === dayId) {
          if (slot.times.length <= 1) {
            return slot; // Keep at least one time per day
          }
          return {
            ...slot,
            times: slot.times.filter((t) => t !== timeToRemove),
          };
        }
        return slot;
      });
    });
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
          source: 'directory',
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

  // Bulk select all group members (deduplicating and filtering selectable & bot number)
  const handleSelectAllGroupMembers = (group: WhatsAppGroup, members: GroupParticipant[]) => {
    const selectables = members.filter((p) => {
      if (!p.selectable) return false;
      if (whatsappState.number) {
        const botClean = whatsappState.number.replace(/\D/g, '');
        const pNumberClean = p.number ? p.number.replace(/\D/g, '') : p.jid.replace(/\D/g, '');
        if (botClean && pNumberClean.endsWith(botClean)) return false;
      }
      return true;
    });

    if (selectables.length === 0) return;

    setFormTargets((prev) => {
      const existingJids = new Set(prev.map((t) => t.jid));
      const toAdd: ScheduledTarget[] = [];

      for (const p of selectables) {
        if (!existingJids.has(p.jid)) {
          existingJids.add(p.jid);
          toAdd.push({
            type: 'person',
            jid: p.jid,
            label: `${p.name || `+${p.number}`} (${group.subject})`,
            name: p.name || undefined,
            source: 'group_member',
          });
        }
      }

      return [...prev, ...toAdd];
    });
  };

  // Bulk deselect all group members
  const handleDeselectAllGroupMembers = (members: GroupParticipant[]) => {
    const memberJidsToRemove = new Set(members.map((p) => p.jid));
    setFormTargets((prev) => prev.filter((t) => !memberJidsToRemove.has(t.jid)));
  };

  // Confirm and execute schedule deletion asynchronously
  const handleConfirmDelete = async () => {
    if (!scheduleToDelete) return;
    setDeletingScheduleId(scheduleToDelete.id);
    setDeleteModalError(null);
    try {
      const res = await deleteSchedule(scheduleToDelete.id);
      if (!res.success) {
        setDeleteModalError(res.error || 'Falha ao excluir o agendamento.');
        return;
      }
      setScheduleToDelete(null);
    } catch (err: any) {
      setDeleteModalError(err?.message || 'Erro inesperado ao excluir o agendamento.');
    } finally {
      setDeletingScheduleId(null);
    }
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
          source: 'group',
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

  // Remove single target chip
  const handleRemoveTarget = (jid: string) => {
    setFormTargets((prev) => prev.filter((t) => t.jid !== jid));
  };

  // Parse Text or CSV list
  const parseImportText = (text: string) => {
    const lines = text.split(/\r?\n/);
    const valid: Array<{ jid: string; number: string; name: string }> = [];
    const seenNumbers = new Set<string>();
    let duplicatesCount = 0;
    let invalidCount = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      let rawNumber = '';
      let rawName = '';

      if (line.includes(',') || line.includes(';') || line.includes('\t')) {
        const delimiter = line.includes(',') ? ',' : line.includes(';') ? ';' : '\t';
        const parts = line.split(delimiter);
        rawNumber = parts[0]?.trim() || '';
        rawName = parts.slice(1).join(' ').trim();
      } else {
        rawNumber = line;
      }

      let clean = rawNumber.replace(/\D/g, '');
      if (clean.length < 10) {
        invalidCount++;
        continue;
      }

      if (clean.length === 10 || clean.length === 11) {
        clean = `55${clean}`;
      }

      if (seenNumbers.has(clean)) {
        duplicatesCount++;
        continue;
      }

      seenNumbers.add(clean);
      valid.push({
        jid: `${clean}@s.whatsapp.net`,
        number: clean,
        name: rawName,
      });
    }

    setImportParsedPreview({
      totalLines: lines.filter((l) => l.trim().length > 0).length,
      valid,
      duplicatesCount,
      invalidCount,
    });
  };

  // Handle CSV/TXT file upload
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setImportRawText(content);
        parseImportText(content);
      }
    };
    reader.readAsText(file);
  };

  // Add parsed imported targets to form
  const handleApplyImportedTargets = () => {
    if (!importParsedPreview || importParsedPreview.valid.length === 0) return;

    const newTargets: ScheduledTarget[] = importParsedPreview.valid.map((item) => ({
      type: 'person',
      jid: item.jid,
      label: item.name ? `${item.name} (+${item.number})` : `+${item.number}`,
      name: item.name || undefined,
      source: 'import',
    }));

    setFormTargets((prev) => {
      const existingJids = new Set(prev.map((t) => t.jid));
      const filtered = newTargets.filter((t) => !existingJids.has(t.jid));
      return [...prev, ...filtered];
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
      setFormError('Por favor, informe o nome do agendamento.');
      return;
    }

    const hasText = Boolean(formMessage && formMessage.trim().length > 0);
    const hasMedia = Boolean(formMedia);

    if (!hasText && !hasMedia) {
      setFormError('Informe pelo menos uma mensagem de texto ou selecione uma imagem.');
      return;
    }

    if (formTargets.length === 0) {
      setFormError('Selecione pelo menos um destinatário para o agendamento.');
      return;
    }

    if (hasImportedTargets && !importComplianceChecked) {
      setFormError('Para disparar para números importados, você deve aceitar o Termo de Conformidade.');
      return;
    }

    // Prepare Delivery Options
    const deliveryOptions: DeliveryOptions = {
      intervalBetweenMessagesMs: Math.max(1000, formIntervalSeconds * 1000),
      batchPauseEnabled: formBatchPauseEnabled,
      batchSize: Math.max(1, formBatchSize),
      batchPauseMs: Math.max(60000, formBatchPauseMinutes * 60000),
    };

    let scheduledAt: string | null = null;
    let payloadDailyTimes: string[] = [];
    let payloadWeeklySlots: WeeklyTimeSlot[] = [];

    if (formType === 'once') {
      const combined = `${formDate}T${formTime}:00`;
      
      // Validar se o horário está no futuro com base no fuso horário do scheduler
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: schedulerTimezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).formatToParts(new Date());
      
      const dict = parts.reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {} as Record<string, string>);
      
      const hour = dict.hour === '24' ? '00' : dict.hour;
      const currentTzString = `${dict.year}-${dict.month}-${dict.day}T${hour}:${dict.minute}:${dict.second}`;
      
      if (combined < currentTzString) {
        setFormError('O horário do agendamento deve estar no futuro.');
        return;
      }
      
      // We pass the local time string directly to the backend.
      // The backend uses process.env.TZ = APP_TIMEZONE to interpret it correctly.
      scheduledAt = combined;
    } else if (formType === 'daily') {
      if (formDailyTimes.length === 0) {
        setFormError('Adicione pelo menos um horário diário de envio.');
        return;
      }
      payloadDailyTimes = formDailyTimes;
    } else if (formType === 'weekly') {
      if (formWeeklyDays.length === 0) {
        setFormError('Selecione pelo menos um dia da semana.');
        return;
      }
      if (formWeeklySlots.length === 0) {
        setFormError('Configure os horários para os dias selecionados.');
        return;
      }
      payloadWeeklySlots = formWeeklySlots;
    }

    setIsSubmitting(true);

    try {
      if (editingSchedule) {
        const res = await updateSchedule(editingSchedule.id, {
          name: formName.trim(),
          message: formMessage.trim(),
          fallbackName: formFallbackName.trim() || 'amigo(a)',
          scheduleType: formType,
          scheduledAt,
          dailyTimes: payloadDailyTimes,
          weeklyTimeSlots: payloadWeeklySlots,
          media: formMedia,
          targets: formTargets,
          deliveryOptions,
        });

        if (!res.success) {
          setFormError(res.error || 'Falha ao atualizar agendamento.');
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createSchedule({
          name: formName.trim(),
          message: formMessage.trim(),
          fallbackName: formFallbackName.trim() || 'amigo(a)',
          scheduleType: formType,
          scheduledAt,
          dailyTimes: payloadDailyTimes,
          weeklyTimeSlots: payloadWeeklySlots,
          media: formMedia,
          targets: formTargets,
          deliveryOptions,
        });

        if (!res.success) {
          setFormError(res.error || 'Falha ao criar agendamento.');
          setIsSubmitting(false);
          return;
        }
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Erro inesperado ao salvar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSourceBadge = (source?: string) => {
    switch (source) {
      case 'group':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Grupo
          </span>
        );
      case 'group_member':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Membro Grupo
          </span>
        );
      case 'import':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Importado
          </span>
        );
      case 'manual':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Avulso
          </span>
        );
      case 'directory':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
            Diretório
          </span>
        );
      default:
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
            Desconhecido
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & New Schedule Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/60 p-6 rounded-3xl border border-neutral-800/80">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            Agendamentos
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Programação recorrente com suporte a múltiplos horários diários e semanais, envio de imagens e controle de ritmo.
          </p>
        </div>

        <Button
          id="btn-new-schedule"
          variant="primary"
          onClick={handleOpenNewModal}
          className="shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo agendamento
        </Button>
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
                          ? new Date(currentProgress.resumeAt).toLocaleTimeString('pt-BR', { timeZone: schedulerTimezone })
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

      {/* Schedules List (Restored 2-Card Desktop Grid) */}
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
          <h3 className="text-lg font-semibold text-white">Nenhum agendamento cadastrado</h3>
          <p className="text-neutral-400 text-sm max-w-sm mx-auto mt-1 mb-6">
            Crie disparos programados com mensagens de texto, imagens anexadas e múltiplos horários de repetição.
          </p>
          <Button
            variant="secondary"
            onClick={handleOpenNewModal}
            className="mt-2"
          >
            <Plus className="w-4 h-4" />
            Criar primeiro agendamento
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {schedules.map((schedule) => {
            const isRunning = executingScheduleId === schedule.id || schedule.status === 'running';

            // Daily times display list
            const dailyTimesList = schedule.dailyTimes || [];

            // Weekly slots display
            const weeklySlotsList =
              schedule.weeklyTimeSlots && schedule.weeklyTimeSlots.length > 0
                ? schedule.weeklyTimeSlots
                : [];

            return (
              <div
                key={schedule.id}
                className="bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700/90 rounded-2xl p-5 transition-all shadow-sm flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Card Header: Title & Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-white truncate" title={schedule.name}>
                        {schedule.name}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        {/* Status Badge */}
                        {isRunning ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Executando
                          </span>
                        ) : schedule.status === 'paused' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Pause className="w-3 h-3" />
                            Pausado
                          </span>
                        ) : schedule.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Concluído
                          </span>
                        ) : schedule.status === 'error' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <XCircle className="w-3 h-3" />
                            Falhou
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">
                            <Clock className="w-3 h-3 text-emerald-400" />
                            Ativo
                          </span>
                        )}

                        {/* Schedule Type Badge */}
                        <span className="px-2 py-0.5 text-xs rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700/60 font-medium">
                          {schedule.scheduleType === 'once'
                            ? 'Único'
                            : schedule.scheduleType === 'daily'
                            ? `Diário (${dailyTimesList.length}x)`
                            : `Semanal (${weeklySlotsList.length} dias)`}
                        </span>

                        {/* Media Indicator Badge */}
                        {schedule.media && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            <ImageIcon className="w-3 h-3" />
                            Imagem ({schedule.media.source === 'upload' ? 'Upload' : 'URL'})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Media Thumbnail & Message Preview */}
                  <div className="flex items-start gap-3 bg-neutral-950/80 p-3 rounded-xl border border-neutral-800/80">
                    {schedule.media && (
                      <div
                        onClick={() => setPreviewMediaModal(schedule.media!)}
                        className="relative group cursor-pointer w-16 h-16 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800 shrink-0 flex items-center justify-center"
                      >
                        <img
                          src={schedule.media.url}
                          alt="Thumbnail do agendamento"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                          <Eye className="w-4 h-4" />
                        </div>
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      {schedule.message ? (
                        <p className="text-xs text-neutral-300 font-sans line-clamp-3 whitespace-pre-wrap">
                          {schedule.message}
                        </p>
                      ) : (
                        <p className="text-xs text-neutral-500 italic">
                          (Envio exclusivo de imagem sem legenda de texto)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Target and Time Details */}
                  <div className="space-y-1.5 text-xs text-neutral-400 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-neutral-300">
                        <Users className="w-3.5 h-3.5 text-neutral-500" />
                        <strong>{schedule.targets.length}</strong> {schedule.targets.length === 1 ? 'destinatário' : 'destinatários'}
                      </span>

                      {schedule.nextRunAt && schedule.status === 'active' && (
                        <span className="flex items-center gap-1 text-emerald-400 font-medium">
                          <Clock className="w-3 h-3" />
                          Próximo: {new Date(schedule.nextRunAt).toLocaleString('pt-BR', { timeZone: schedulerTimezone })}
                        </span>
                      )}
                    </div>

                    {/* Multi-slot timing chips */}
                    {schedule.scheduleType === 'daily' && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[11px] text-neutral-500">Horários diários:</span>
                        {dailyTimesList.length > 0 ? (
                          dailyTimesList.map((t, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[11px] text-emerald-300 font-mono"
                            >
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-red-400">Sem horário configurado</span>
                        )}
                      </div>
                    )}

                    {schedule.scheduleType === 'weekly' && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[11px] text-neutral-500">Dias e horários:</span>
                        {weeklySlotsList.length > 0 ? (
                          weeklySlotsList.map((slot) => {
                            const dayObj = WEEK_DAYS.find((d) => d.id === slot.day);
                            return (
                              <span
                                key={slot.day}
                                className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[11px] text-neutral-200"
                              >
                                <strong className="text-emerald-400">{dayObj?.label}:</strong> {slot.times.length > 0 ? slot.times.join(', ') : 'Sem horário'}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-[11px] text-red-400">Sem horário configurado</span>
                        )}
                      </div>
                    )}

                    {/* Delivery rhythm parameters */}
                    {schedule.deliveryOptions && (
                      <div className="flex items-center gap-2 text-[11px] text-neutral-500 pt-0.5">
                        <Sliders className="w-3 h-3 text-neutral-600" />
                        <span>Intervalo: {Math.round(schedule.deliveryOptions.intervalBetweenMessagesMs / 1000)}s</span>
                        {schedule.deliveryOptions.batchPauseEnabled && (
                          <span>• Pausa: a cada {schedule.deliveryOptions.batchSize} msgs por {Math.round(schedule.deliveryOptions.batchPauseMs / 60000)} min</span>
                        )}
                      </div>
                    )}

                    {/* Report link */}
                    {schedule.lastResult && (
                      <div className="pt-1">
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
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons (Compact Style Restored) */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-neutral-800">
                  <button
                    id={`btn-run-now-${schedule.id}`}
                    type="button"
                    onClick={() => runNow(schedule.id)}
                    disabled={isRunning || !isConnected}
                    title="Executar agora"
                    aria-label="Executar agora"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 text-emerald-400 border border-emerald-500/30 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer select-none"
                  >
                    {isRunning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>Executar agora</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {schedule.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => pauseSchedule(schedule.id)}
                        disabled={isRunning}
                        title="Pausar agendamento"
                        aria-label="Pausar agendamento"
                        className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-300 hover:text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    ) : schedule.status === 'paused' ? (
                      <button
                        type="button"
                        onClick={() => resumeSchedule(schedule.id)}
                        disabled={isRunning}
                        title="Retomar agendamento"
                        aria-label="Retomar agendamento"
                        className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-emerald-400 hover:text-emerald-300 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => handleOpenDuplicateModal(schedule)}
                      title="Duplicar agendamento"
                      aria-label="Duplicar agendamento"
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-blue-400 hover:text-blue-300 flex items-center justify-center transition-all cursor-pointer select-none"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(schedule)}
                      disabled={isRunning}
                      title="Editar agendamento"
                      aria-label="Editar agendamento"
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-300 hover:text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setScheduleToDelete(schedule);
                        setDeleteModalError(null);
                      }}
                      disabled={isRunning}
                      title="Excluir agendamento"
                      aria-label="Excluir agendamento"
                      className="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 hover:text-rose-300 border border-rose-500/20 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Novo / Editar Agendamento */}
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
                  Configure mensagens, imagens, múltiplos horários de repetição e ritmo de envio.
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
            <form
              id="schedule-form"
              onSubmit={handleSubmit}
              className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden overscroll-contain p-6 space-y-6"
            >
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
                  placeholder="Ex: Bom dia Clientes, Lembrete de Aula, Oferta da Semana..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* 2. Mídia (Imagem Opcional) */}
              <div className="space-y-3 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-purple-400" />
                    2. Mídia / Imagem (Opcional)
                  </label>
                  {formMedia && (
                    <button
                      type="button"
                      onClick={handleRemoveMedia}
                      className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remover Imagem
                    </button>
                  )}
                </div>

                {/* Media Preview if attached */}
                {formMedia ? (
                  <div className="flex items-center gap-4 bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-neutral-950 border border-neutral-800 shrink-0">
                      <img
                        src={formMedia.url}
                        alt="Preview da imagem"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1 text-xs">
                      <div className="font-semibold text-white truncate">{formMedia.fileName}</div>
                      <div className="text-[11px] text-neutral-400 flex items-center gap-2">
                        <span>Origem: {formMedia.source === 'upload' ? 'Upload Local' : 'URL Externa'}</span>
                        {formMedia.size && <span>• {Math.round(formMedia.size / 1024)} KB</span>}
                      </div>
                      <div className="text-[11px] text-emerald-400 font-medium">
                        ✓ Imagem pronta para disparo
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Media Tabs */}
                    <div className="flex rounded-xl bg-neutral-900 p-1 border border-neutral-800">
                      <button
                        type="button"
                        onClick={() => {
                          setMediaTab('upload');
                          setMediaError(null);
                        }}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                          mediaTab === 'upload'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload (JPG, PNG, WebP)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMediaTab('url');
                          setMediaError(null);
                        }}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                          mediaTab === 'url'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        URL da Imagem
                      </button>
                    </div>

                    {mediaError && (
                      <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                        {mediaError}
                      </div>
                    )}

                    {mediaTab === 'upload' ? (
                      <div className="border-2 border-dashed border-neutral-800 hover:border-neutral-700 rounded-xl p-5 text-center transition-colors">
                        <input
                          type="file"
                          ref={mediaFileInputRef}
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleMediaFileUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={mediaUploading}
                          onClick={() => mediaFileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {mediaUploading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                          ) : (
                            <Upload className="w-4 h-4 text-purple-400" />
                          )}
                          {mediaUploading ? 'Enviando imagem...' : 'Selecionar Imagem do Computador'}
                        </button>
                        <p className="text-[11px] text-neutral-500 mt-2">
                          Formatos aceitos: JPG, PNG, WebP (Tamanho máximo: 10 MB)
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="url"
                            placeholder="https://exemplo.com/imagem.jpg"
                            value={mediaUrlInput}
                            onChange={(e) => setMediaUrlInput(e.target.value)}
                            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={handleApplyMediaUrl}
                            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition-colors"
                          >
                            Carregar
                          </button>
                        </div>
                        <p className="text-[11px] text-neutral-500">
                          A URL deve ser pública e direta para a imagem.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Mensagem & Personalização ({nome}) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    3. Mensagem & Personalização {formMedia && '(Opcional se houver imagem)'}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormMessage((prev) => `${prev} {nome}`)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-500/20 transition-colors"
                      title="Inserir variável de nome"
                    >
                      <Sparkles className="w-3 h-3" />
                      + {'{nome}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormMessage((prev) => `${prev} {Oi|Olá|Bom dia}`)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-1 rounded-lg border border-purple-500/20 transition-colors"
                      title="Inserir Spintax"
                    >
                      <Sparkles className="w-3 h-3" />
                      + Spintax
                    </button>
                  </div>
                </div>

                <textarea
                  rows={4}
                  placeholder={
                    formMedia
                      ? 'Legenda opcional da imagem. Use {nome} ou {Opção 1|Opção 2} para Spintax...'
                      : 'Digite sua mensagem. Use {nome} ou {Opção 1|Opção 2} para Spintax...'
                  }
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors font-sans"
                />
                
                <p className="text-[11px] text-neutral-500 mt-1">
                  Use <code className="text-purple-400 bg-purple-400/10 px-1 rounded">{"{Oi|Olá}"}</code> para gerar variações automáticas na mensagem (Spintax).
                </p>

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
                        : formMedia
                        ? '(Apenas envio da imagem anexada)'
                        : 'Sua mensagem renderizada aparecerá aqui...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 4. Destinatários Tabs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    4. Destinatários ({formTargets.length} selecionados)
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
                  <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-neutral-950 border border-neutral-800 max-h-32 overflow-y-auto scrollbar-hidden">
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

                      <div className="max-h-48 overflow-y-auto scrollbar-hidden space-y-1 pr-1">
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
                            placeholder="DDD + Número (ex: 11999998888)"
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

                      <div className="max-h-60 overflow-y-auto scrollbar-hidden space-y-2 pr-1">
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
                                {isExpanded && (() => {
                                  const selectableParticipants = participants.filter((p) => {
                                    if (!p.selectable) return false;
                                    if (whatsappState.number) {
                                      const botClean = whatsappState.number.replace(/\D/g, '');
                                      const pNumberClean = p.number ? p.number.replace(/\D/g, '') : p.jid.replace(/\D/g, '');
                                      if (botClean && pNumberClean.endsWith(botClean)) return false;
                                    }
                                    return true;
                                  });

                                  const selectedMemberJids = new Set(formTargets.map((t) => t.jid));
                                  const selectedCountInThisGroup = selectableParticipants.filter((p) =>
                                    selectedMemberJids.has(p.jid)
                                  ).length;
                                  const isAllSelected =
                                    selectableParticipants.length > 0 &&
                                    selectedCountInThisGroup === selectableParticipants.length;

                                  return (
                                    <div className="pt-2 border-t border-neutral-800/80 pl-4 sm:pl-6 space-y-2">
                                      {/* Bulk Toolbar */}
                                      {!isLoadingParticipants && selectableParticipants.length > 0 && (
                                        <div className="flex items-center justify-between gap-2 py-1.5 px-2.5 bg-neutral-950/80 rounded-xl border border-neutral-800">
                                          <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 truncate">
                                            <Users className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                                            <span>
                                              {selectedCountInThisGroup} de {selectableParticipants.length} selecionados
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {isAllSelected ? (
                                              <Button
                                                type="button"
                                                variant="secondary"
                                                size="xs"
                                                onClick={() => handleDeselectAllGroupMembers(participants)}
                                              >
                                                Desmarcar todos
                                              </Button>
                                            ) : (
                                              <Button
                                                type="button"
                                                variant="primary-soft"
                                                size="xs"
                                                disabled={selectableParticipants.length === 0}
                                                onClick={() => handleSelectAllGroupMembers(group, participants)}
                                              >
                                                Selecionar todos ({selectableParticipants.length})
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-hidden">
                                        {isLoadingParticipants ? (
                                          <div className="py-3 text-center text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                                            Obtendo membros do grupo...
                                          </div>
                                        ) : participants.length === 0 ? (
                                          <div className="text-[11px] text-neutral-500 py-2 text-center">
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
                                                className={`flex items-center justify-between p-2 rounded-xl text-[11px] transition-colors ${
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
                                    </div>
                                  );
                                })()}
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

              {/* 5. Frequência & Múltiplos Horários */}
              <div className="space-y-3 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    5. Frequência & Horários de Envio
                  </label>
                  <span className="text-[10px] text-neutral-500 font-mono px-2 py-0.5 bg-neutral-900 rounded-md border border-neutral-800">
                    Fuso: {schedulerTimezone}
                  </span>
                </div>

                {/* Frequency selector buttons */}
                <div className="grid grid-cols-3 gap-2">
                  {(['once', 'daily', 'weekly'] as ScheduleType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormType(type)}
                      className={`py-2 rounded-xl text-xs font-semibold transition-all border ${
                        formType === type
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800'
                      }`}
                    >
                      {type === 'once' ? 'Único (Uma Vez)' : type === 'daily' ? 'Diário (Múltiplos)' : 'Semanal (Múltiplos)'}
                    </button>
                  ))}
                </div>

                {/* Case 1: Once (Date + Single Time) */}
                {formType === 'once' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
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
                  </div>
                )}

                {/* Case 2: Daily (Multi-slot time list) */}
                {formType === 'daily' && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">
                        Horários de disparo diário ({formDailyTimes.length} ativos):
                      </span>
                    </div>

                    {/* Chips of daily times */}
                    <div className="flex flex-wrap gap-2">
                      {formDailyTimes.map((time) => (
                        <span
                          key={time}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 border border-emerald-500/30 text-emerald-300 font-mono text-xs"
                        >
                          <Clock className="w-3 h-3 text-emerald-400" />
                          {time}
                          {formDailyTimes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDailyTime(time)}
                              className="hover:text-rose-400 ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    {/* Add another daily time */}
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
                      <input
                        type="time"
                        value={newDailyTimeInput}
                        onChange={(e) => setNewDailyTimeInput(e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddDailyTime}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-emerald-400 text-xs font-semibold transition-colors border border-neutral-700"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar Horário Diário
                      </button>
                    </div>
                  </div>
                )}

                {/* Case 3: Weekly (Multi-slot per day) */}
                {formType === 'weekly' && (
                  <div className="space-y-3 pt-2">
                    {/* Days selector */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1.5">
                        1. Selecione os Dias da Semana:
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEK_DAYS.map((d) => {
                          const isSelected = formWeeklyDays.includes(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => handleToggleWeeklyDay(d.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                                isSelected
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold'
                                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800'
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Times per day manager */}
                    <div className="p-3 bg-neutral-900 rounded-xl border border-neutral-800 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-300 font-semibold">
                          2. Horários configurados por dia:
                        </span>
                        <div className="flex gap-1">
                          {formWeeklyDays.map((dayId) => {
                            const dayObj = WEEK_DAYS.find((d) => d.id === dayId);
                            const isActive = selectedWeeklyDayForTimes === dayId;
                            return (
                              <button
                                key={dayId}
                                type="button"
                                onClick={() => setSelectedWeeklyDayForTimes(dayId)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                  isActive
                                    ? 'bg-emerald-500 text-neutral-950'
                                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                                }`}
                              >
                                {dayObj?.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Display slots for selected day */}
                      {(() => {
                        const currentSlot = formWeeklySlots.find(
                          (s) => s.day === selectedWeeklyDayForTimes
                        );
                        const dayObj = WEEK_DAYS.find((d) => d.id === selectedWeeklyDayForTimes);
                        const times = currentSlot?.times || ['08:00'];

                        return (
                          <div className="space-y-2 pt-1">
                            <span className="text-[11px] text-neutral-400 block">
                              Horários para <strong>{dayObj?.full}:</strong>
                            </span>

                            <div className="flex flex-wrap gap-2">
                              {times.map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-950 border border-emerald-500/30 text-emerald-300 font-mono text-xs"
                                >
                                  <Clock className="w-3 h-3 text-emerald-400" />
                                  {t}
                                  {times.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemoveWeeklyTime(selectedWeeklyDayForTimes, t)
                                      }
                                      className="hover:text-rose-400 ml-1"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                              <input
                                type="time"
                                value={newWeeklyTimeInput}
                                onChange={(e) => setNewWeeklyTimeInput(e.target.value)}
                                className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddWeeklyTime(selectedWeeklyDayForTimes)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-emerald-400 text-xs font-semibold transition-colors border border-neutral-700"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Adicionar Horário para {dayObj?.label}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Controle de Ritmo e Pausa de Lote */}
              <div className="space-y-3 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  6. Controle de Ritmo & Fila de Entrega
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

            {/* Modal Footer */}
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

      {/* Modal: Visualizar Imagem em Tamanho Real */}
      {previewMediaModal && (
        <div
          className="fixed inset-0 z-50 overflow-hidden p-4 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewMediaModal(null)}
        >
          <div
            className="max-w-2xl max-h-[85vh] flex flex-col bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 px-5 border-b border-neutral-800 bg-neutral-900 shrink-0">
              <span className="text-xs font-semibold text-white truncate max-w-sm">
                {previewMediaModal.fileName}
              </span>
              <button
                onClick={() => setPreviewMediaModal(null)}
                className="p-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-neutral-950">
              <img
                src={previewMediaModal.url}
                alt="Imagem ampliada"
                className="max-w-full max-h-[70vh] rounded-xl object-contain"
                referrerPolicy="no-referrer"
              />
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
                  Executado em {new Date(selectedResultDetails.result.executedAt).toLocaleString('pt-BR', { timeZone: schedulerTimezone })}
                </p>
              </div>
              <button
                onClick={() => setSelectedResultDetails(null)}
                className="p-2 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden p-6 space-y-4">
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
                <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hidden pr-1">
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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedResultDetails(null)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {scheduleToDelete && (
        <div
          className="fixed inset-0 z-50 overflow-hidden p-4 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => {
            if (!deletingScheduleId) {
              setScheduleToDelete(null);
              setDeleteModalError(null);
            }
          }}
        >
          <div
            className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              {/* Header Icon + Title */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white">
                    Excluir agendamento
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Esta ação é irreversível e removerá permanentemente a programação e todos os disparos futuros.
                  </p>
                </div>
              </div>

              {/* Schedule Info Box */}
              <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800/80 space-y-2">
                <span className="text-sm font-semibold text-white block truncate">
                  {scheduleToDelete.name}
                </span>
                <div className="flex items-center gap-3 text-xs text-neutral-400 flex-wrap">
                  <span className="flex items-center gap-1 text-neutral-300">
                    <Users className="w-3.5 h-3.5 text-neutral-500" />
                    {scheduleToDelete.targets.length} {scheduleToDelete.targets.length === 1 ? 'destinatário' : 'destinatários'}
                  </span>
                  <span className="text-neutral-500">•</span>
                  <span>
                    {scheduleToDelete.scheduleType === 'once'
                      ? 'Envio único'
                      : scheduleToDelete.scheduleType === 'daily'
                      ? 'Repetição diária'
                      : 'Repetição semanal'}
                  </span>
                  {scheduleToDelete.media && (
                    <>
                      <span className="text-neutral-500">•</span>
                      <span className="text-purple-300">Com imagem</span>
                    </>
                  )}
                </div>
              </div>

              {/* Error Message Banner */}
              {deleteModalError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{deleteModalError}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 bg-neutral-950/60 border-t border-neutral-800 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={deletingScheduleId !== null}
                onClick={() => {
                  setScheduleToDelete(null);
                  setDeleteModalError(null);
                }}
              >
                Cancelar
              </Button>

              <Button
                id="btn-confirm-delete-schedule"
                type="button"
                variant="danger"
                size="sm"
                isLoading={deletingScheduleId !== null}
                disabled={deletingScheduleId !== null}
                onClick={handleConfirmDelete}
              >
                <Trash2 className="w-4 h-4" />
                Excluir agendamento
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
