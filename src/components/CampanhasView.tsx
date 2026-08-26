import { useTemplates } from '../hooks/useTemplates';
import React, { useState, useMemo, type FormEvent, type ChangeEvent, useRef, useEffect } from 'react';
import { 
  Megaphone, Plus, Search, Calendar, Clock, Image as ImageIcon,
  Play, Pause, Trash2, Edit3, X, AlertTriangle, Users, FileText,
  Upload, Trash, Sparkles, Link as LinkIcon, CheckCircle, BarChart3, ArrowLeft
} from 'lucide-react';
import { useCampaigns } from '../hooks/useCampaigns';
import { useCampaignHistory } from "../hooks/useCampaignHistory";
import { useAudiences } from '../hooks/useAudiences';
import { Button } from './ui/Button';
import type { Campaign, CampaignScheduleConfig, DeliveryOptions, ScheduledMedia, ScheduleType, WeeklyTimeSlot } from '../types';
import { renderMessageTemplate } from '../utils/template';

const WEEK_DAYS = [
  { id: 0, label: 'Dom', full: 'Domingo' },
  { id: 1, label: 'Seg', full: 'Segunda-feira' },
  { id: 2, label: 'Ter', full: 'Terça-feira' },
  { id: 3, label: 'Qua', full: 'Quarta-feira' },
  { id: 4, label: 'Qui', full: 'Quinta-feira' },
  { id: 5, label: 'Sex', full: 'Sexta-feira' },
  { id: 6, label: 'Sáb', full: 'Sábado' },
];

interface CampanhasViewProps {
  selectedInstanceId: string | null;
}

export function CampanhasView({ selectedInstanceId }: CampanhasViewProps) {
  const { templates } = useTemplates();
  const {
    state: campaigns, loading: campaignsLoading, error: campaignsError,
    createCampaign, updateCampaign, scheduleCampaign,
    pauseCampaign, resumeCampaign, unscheduleCampaign, deleteCampaign
  } = useCampaigns(selectedInstanceId);
  const { summaries, detail, loading: historyLoading, error: historyError, fetchSummaries, fetchDetail, clear: clearHistory } = useCampaignHistory(selectedInstanceId);

  useEffect(() => {
    setIsResultsModalOpen(false);
    setSelectedResultsCampaign(null);
    clearHistory();
  }, [selectedInstanceId, clearHistory]);


  const { state: audiences } = useAudiences(selectedInstanceId);

  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  
  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [selectedResultsCampaign, setSelectedResultsCampaign] = useState<Campaign | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [audienceListId, setAudienceListId] = useState('');
  const [message, setMessage] = useState('');
  const [templateToConfirm, setTemplateToConfirm] = useState<string | null>(null);
  const handleApplyTemplate = (e: ChangeEvent<HTMLSelectElement>) => {
    const templateId = e.target.value;
    e.target.value = '';
    if (!templateId) return;
    const t = templates?.find(x => x.id === templateId);
    if (!t) return;
    if (message.trim()) {
      setTemplateToConfirm(t.id);
      return;
    }
    setMessage(t.message);
    setFallbackName(t.fallbackName);
  };
  const [fallbackName, setFallbackName] = useState('amigo(a)');
  
  // Schedule
  const [formType, setFormType] = useState<ScheduleType>('once');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('08:00');
  
  const [formDailyTimes, setFormDailyTimes] = useState<string[]>(['08:00']);
  const [newDailyTimeInput, setNewDailyTimeInput] = useState('14:00');

  const [formWeeklyDays, setFormWeeklyDays] = useState<number[]>([1]); // Seg
  const [formWeeklySlots, setFormWeeklySlots] = useState<WeeklyTimeSlot[]>([
    { day: 1, times: ['08:00'] }
  ]);
  const [selectedWeeklyDayForTimes, setSelectedWeeklyDayForTimes] = useState<number>(1);
  const [newWeeklyTimeInput, setNewWeeklyTimeInput] = useState('14:00');

  // Media
  const [formMedia, setFormMedia] = useState<ScheduledMedia | null>(null);
  const [mediaTab, setMediaTab] = useState<'upload' | 'url'>('upload');
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delivery Options
  const [formIntervalSeconds, setFormIntervalSeconds] = useState(5);
  const [formBatchPauseEnabled, setFormBatchPauseEnabled] = useState(false);
  const [formBatchSize, setFormBatchSize] = useState(5);
  const [formBatchPauseMinutes, setFormBatchPauseMinutes] = useState(5);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);


  const filteredCampaigns = useMemo(() => {
    if (!campaigns) return [];
    if (!search.trim()) return campaigns;
    const lower = search.toLowerCase();
    return campaigns.filter(c => c.name.toLowerCase().includes(lower));
  }, [campaigns, search]);

  const metrics = useMemo(() => {
    if (!campaigns) return { total: 0, drafts: 0, active: 0, paused: 0 };
    return {
      total: campaigns.length,
      drafts: campaigns.filter(c => c.scheduleId === null).length,
      active: campaigns.filter(c => {
        const s = (c as any).status;
        return s === 'active' || s === 'running';
      }).length,
      paused: campaigns.filter(c => (c as any).status === 'paused').length
    };
  }, [campaigns]);

  const getStatusPresentation = (status: string) => {
    switch (status) {
      case 'draft': return { label: 'Rascunho', color: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20' };
      case 'active': return { label: 'Ativa', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'running': return { label: 'Executando', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
      case 'paused': return { label: 'Pausada', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'completed': return { label: 'Concluída', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
      case 'error': return { label: 'Erro', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      case 'missing_schedule': return { label: 'Agendamento ausente', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      default: return { label: status, color: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20' };
    }
  };


  const resetForm = () => {
    setEditingId(null);
    setName('');
    setAudienceListId('');
    setMessage('');
    setTemplateToConfirm(null);
    setFallbackName('amigo(a)');
    
    setFormType('once');
    setFormDate('');
    setFormTime('08:00');
    setFormDailyTimes(['08:00']);
    setNewDailyTimeInput('14:00');
    setFormWeeklyDays([1]);
    setFormWeeklySlots([{ day: 1, times: ['08:00'] }]);
    setSelectedWeeklyDayForTimes(1);
    setNewWeeklyTimeInput('14:00');

    setFormMedia(null);
    setMediaTab('upload');
    setMediaUrlInput('');
    setMediaError(null);

    setFormIntervalSeconds(5);
    setFormBatchPauseEnabled(false);
    setFormBatchSize(5);
    setFormBatchPauseMinutes(5);

    setActionError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Campaign) => {
    resetForm();
    setEditingId(c.id);
    setName(c.name);
    setAudienceListId(c.audienceListId || '');
    setMessage(c.message);
    setFallbackName(c.fallbackName);
    
    setFormType(c.schedule.scheduleType);
    if (c.schedule.scheduleType === 'once' && c.schedule.scheduledAt) {
      const raw = c.schedule.scheduledAt;
      const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/);
      if (match) {
        setFormDate(match[1]);
        setFormTime(match[2]);
      }
    }
    if (c.schedule.dailyTimes) setFormDailyTimes([...c.schedule.dailyTimes]);
    if (c.schedule.weeklyTimeSlots) {
      setFormWeeklySlots([...c.schedule.weeklyTimeSlots]);
      setFormWeeklyDays(c.schedule.weeklyTimeSlots.map(s => s.day));
      if (c.schedule.weeklyTimeSlots.length > 0) {
        setSelectedWeeklyDayForTimes(c.schedule.weeklyTimeSlots[0].day);
      }
    }

    if (c.media) {
      setFormMedia(c.media);
      if (c.media.source === 'url' && c.media.url) {
        setMediaTab('url');
        setMediaUrlInput(c.media.url);
      }
    }

    if (c.schedule.deliveryOptions) {
      setFormIntervalSeconds(c.schedule.deliveryOptions.intervalBetweenMessagesMs / 1000);
      setFormBatchPauseEnabled(c.schedule.deliveryOptions.batchPauseEnabled);
      setFormBatchSize(c.schedule.deliveryOptions.batchSize);
      setFormBatchPauseMinutes(c.schedule.deliveryOptions.batchPauseMs / 60000);
    }

    setIsModalOpen(true);
  };

  const uploadMedia = async (file: File): Promise<ScheduledMedia> => {
    if (!selectedInstanceId) throw new Error('Nenhuma instância selecionada');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/instances/${selectedInstanceId}/media/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao fazer upload da mídia');
    return data.media;
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setMediaUploading(true);
      setMediaError(null);
      const media = await uploadMedia(file);
      setFormMedia(media);
    } catch (err: any) {
      setMediaError(err.message || 'Erro no upload');
    } finally {
      setMediaUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddMediaUrl = () => {
    if (!mediaUrlInput.trim()) {
      setMediaError('Insira uma URL válida');
      return;
    }
    try {
      new URL(mediaUrlInput.trim());
      setFormMedia({
        type: 'image',
        source: 'url',
        url: mediaUrlInput.trim()
      });
      setMediaError(null);
    } catch {
      setMediaError('A URL fornecida é inválida');
    }
  };

  const handleSaveDraft = async () => {
    try {
      setActionError(null);
      if (!name.trim()) throw new Error('Nome é obrigatório');

      let scheduledAt: string | null = null;
      if (formType === 'once' && formDate && formTime) {
        scheduledAt = `${formDate}T${formTime}:00`;
      }

      const scheduleConfig: CampaignScheduleConfig = {
        scheduleType: formType,
        scheduledAt,
        dailyTimes: formType === 'daily' ? formDailyTimes : [],
        weeklyTimeSlots: formType === 'weekly' ? formWeeklySlots : [],
        deliveryOptions: {
          intervalBetweenMessagesMs: (formIntervalSeconds || 5) * 1000,
          batchPauseEnabled: formBatchPauseEnabled,
          batchSize: formBatchSize || 5,
          batchPauseMs: (formBatchPauseMinutes || 5) * 60000
        }
      };

      const payload: Partial<Campaign> = {
        name,
        audienceListId: audienceListId || null,
        message,
        fallbackName,
        media: formMedia,
        schedule: scheduleConfig
      };

      setIsSubmitting(true);
      if (editingId) {
        await updateCampaign(editingId, payload);
      } else {
        if (!selectedInstanceId) throw new Error('Instância não selecionada');
        await createCampaign({ ...payload, instanceId: selectedInstanceId } as Partial<Campaign>);
      }
      setIsModalOpen(false);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSchedule = async (id: string) => {
    try { setActionError(null); await scheduleCampaign(id); }
    catch (e: any) { setActionError(e.message); }
  };
  const handlePause = async (id: string) => {
    try { setActionError(null); await pauseCampaign(id); }
    catch (e: any) { setActionError(e.message); }
  };
  const handleResume = async (id: string) => {
    try { setActionError(null); await resumeCampaign(id); }
    catch (e: any) { setActionError(e.message); }
  };
  const handleUnschedule = async (id: string) => {
    try { setActionError(null); await unscheduleCampaign(id); }
    catch (e: any) { setActionError(e.message); }
  };
  const handleDelete = async (id: string) => {
    try { setActionError(null); await deleteCampaign(id); setDeleteConfirm(null); }
    catch (e: any) { setActionError(e.message); }
  };


  const handleOpenResults = (c: Campaign) => {
    setSelectedResultsCampaign(c);
    setIsResultsModalOpen(true);
    fetchSummaries(c.id);
  };

  const handleCloseResults = () => {
    setIsResultsModalOpen(false);
    setSelectedResultsCampaign(null);
    clearHistory();
  };

  const handleOpenCreateWrapper = () => {
    handleOpenCreate();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSaveDraft();
  };

  // Body scroll lock
  useEffect(() => {
    if (!isModalOpen && !isResultsModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen, isResultsModalOpen]);

  const selectedListObj = audiences?.lists.find(l => l.id === audienceListId);
  const selectedListMissing = Boolean(audienceListId && audiences && !selectedListObj);


  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4 animate-in fade-in duration-500">
        <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4 shadow-xl">
          <Users className="w-8 h-8 text-neutral-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Instância Não Selecionada</h2>
        <p className="text-neutral-400 max-w-md">
          Selecione ou conecte uma instância do WhatsApp no painel lateral para gerenciar Campanhas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Campanhas</h1>
              <p className="text-sm text-neutral-400 mt-1">Organize ações de comunicação para suas audiências e acompanhe o ciclo de cada campanha.</p>
            </div>
          </div>
          <Button variant="primary" onClick={handleOpenCreateWrapper} className="shrink-0">
            <Plus className="w-5 h-5 mr-2" />
            Nova Campanha
          </Button>
        </div>
      </div>

      {(actionError || campaignsError) && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-sm text-rose-400 font-medium">
            {actionError || campaignsError}
          </p>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Total de Campanhas</p>
            <p className="text-2xl font-bold text-white mt-0.5">{metrics.total}</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-neutral-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Rascunhos</p>
            <p className="text-2xl font-bold text-white mt-0.5">{metrics.drafts}</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
            <Play className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Ativas</p>
            <p className="text-2xl font-bold text-blue-400 mt-0.5">{metrics.active}</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
            <Pause className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Pausadas</p>
            <p className="text-2xl font-bold text-amber-400 mt-0.5">{metrics.paused}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar campanhas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* List */}
      {campaignsLoading ? (
        <div className="flex flex-col items-center justify-center h-48 text-neutral-400">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          Carregando campanhas...
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-neutral-900/50 border border-neutral-800/50 rounded-3xl border-dashed">
          <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center mb-4">
            <Megaphone className="w-8 h-8 text-neutral-600" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Nenhuma campanha criada</h3>
          <p className="text-neutral-400 max-w-sm mb-6">
            Crie uma campanha para organizar uma audiência, mensagem e programação.
          </p>
          <Button variant="primary" onClick={handleOpenCreateWrapper}>
            <Plus className="w-4 h-4 mr-2" />
            Criar primeira campanha
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCampaigns.map(c => {
            const isDraft = c.scheduleId === null;
            const backendStatus = isDraft ? 'draft' : ((c as any).status || 'missing_schedule');
            const { label: statusLabel, color: statusColor } = getStatusPresentation(backendStatus);

            let audienceLabel = 'Audiência não definida';
            let targetCount = 0;
            if (c.audienceSnapshot) {
              audienceLabel = c.audienceSnapshot.listName;
              targetCount = c.audienceSnapshot.targetCount;
            } else if (c.audienceListId && audiences) {
              const list = audiences.lists.find(l => l.id === c.audienceListId);
              if (list) {
                audienceLabel = list.name;
                targetCount = list.contactJids.length;
              }
            }

            return (
              <div key={c.id} className="bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700/90 rounded-2xl p-5 shadow-sm flex flex-col gap-4 transition-all">
                <div className="flex items-start justify-between min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h3 className="font-bold text-white truncate pr-2" title={c.name}>{c.name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${statusColor}`}>
                        {statusLabel}
                      </span>
                      <span className="text-[11px] text-neutral-500 font-mono">
                        {c.schedule.scheduleType.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {deleteConfirm === c.id ? (
                      <div className="flex items-center gap-2 bg-neutral-950 p-1.5 rounded-lg border border-rose-500/30">
                        <span className="text-xs text-rose-400 font-medium px-2">Excluir?</span>
                        <Button type="button" size="sm" variant="danger" className="h-7 px-3 text-xs" onClick={() => handleDelete(c.id)}>
                          Sim
                        </Button>
                        <Button type="button" size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={() => setDeleteConfirm(null)}>
                          Não
                        </Button>
                      </div>
                    ) : (
                      <>
                        {isDraft && (
                          <>
                            <button type="button" aria-label="Agendar" title="Agendar Disparo" className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors" onClick={() => handleSchedule(c.id)}>
                              <Calendar className="w-4 h-4" />
                            </button>
                            <button type="button" aria-label="Editar" title="Editar Rascunho" className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors" onClick={() => handleOpenEdit(c)}>
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {(backendStatus === 'active' || backendStatus === 'running') && (
                          <button type="button" aria-label="Pausar" title="Pausar" className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/10 transition-colors" onClick={() => handlePause(c.id)}>
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {backendStatus === 'paused' && (
                          <button type="button" aria-label="Retomar" title="Retomar" className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors" onClick={() => handleResume(c.id)}>
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {!isDraft && (
                           <button type="button" aria-label="Voltar para rascunho" title="Voltar Rascunho" className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors" onClick={() => handleUnschedule(c.id)}>
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        <button type="button" aria-label="Resultados" title="Resultados" className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors" onClick={() => handleOpenResults(c)}>
                          <BarChart3 className="w-4 h-4" />
                        </button>
                        <button type="button" aria-label="Excluir" title="Excluir" className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition-colors" onClick={() => setDeleteConfirm(c.id)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs mt-auto pt-2">
                  <div className="space-y-1">
                    <span className="text-neutral-500 font-medium uppercase tracking-wider text-[10px]">AUDIÊNCIA</span>
                    <div className="flex items-center gap-1.5 text-neutral-300">
                      <Users className="w-3.5 h-3.5" />
                      <span className="truncate">{audienceLabel}</span>
                    </div>
                    <div className="text-neutral-500">{targetCount} {targetCount === 1 ? 'contato' : 'contatos'}</div>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <span className="text-neutral-500 font-medium uppercase tracking-wider text-[10px]">PROGRAMAÇÃO</span>
                    <div className="flex items-center gap-1.5 text-neutral-300">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="truncate">{c.schedule.scheduleType === 'once' ? 'Envio Único' : c.schedule.scheduleType === 'daily' ? 'Diário' : 'Semanal'}</span>
                    </div>
                    <div className="text-neutral-500 truncate">
                      {c.schedule.scheduleType === 'once' && c.schedule.scheduledAt && (
                        new Date(c.schedule.scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                      )}
                      {c.schedule.scheduleType === 'daily' && (
                        c.schedule.dailyTimes.join(', ')
                      )}
                      {c.schedule.scheduleType === 'weekly' && (
                        `${c.schedule.weeklyTimeSlots.length} dias`
                      )}
                    </div>
                  </div>
                </div>

                {c.media && (
                  <div className="pt-3 border-t border-neutral-800/60 flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs text-purple-300 truncate">Imagem anexada ({c.media.source === 'upload' ? 'Upload' : 'URL'})</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nova/Editar Campanha */}
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
                  <Megaphone className="w-5 h-5 text-emerald-400" />
                  {editingId ? 'Editar Campanha' : 'Nova Campanha'}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Configure audiência, mensagem, imagem e programação.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar modal"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form
              id="campaign-form"
              onSubmit={handleSubmit}
              className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden overscroll-contain p-6 space-y-6"
            >
              {actionError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* 1. Nome da Campanha */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  1. Nome da Campanha
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Oferta Black Friday, Lembrete Mensal..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* 2. Audiência */}
              <div className="space-y-3 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-400" />
                  2. Audiência (Listas)
                </label>
                <select
                  value={audienceListId}
                  onChange={(e) => setAudienceListId(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione uma lista de contatos...</option>
                  {audiences?.lists.map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
                {selectedListObj && (
                  <div className="flex items-center gap-2 p-3 bg-neutral-900 rounded-xl border border-neutral-800">
                    <span className="text-sm text-white font-medium truncate">{selectedListObj.name}</span>
                    <span className="text-xs text-neutral-400 ml-auto shrink-0">{selectedListObj.contactJids.length} contatos</span>
                  </div>
                )}
                {selectedListObj && selectedListObj.contactJids.length === 0 && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Esta lista está vazia. O rascunho pode ser salvo, mas não programado.
                  </p>
                )}
                {selectedListMissing && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-400">
                      Lista não encontrada. Selecione outra audiência antes de programar.
                    </p>
                  </div>
                )}
              </div>

              {/* 3. Mídia / Imagem */}
              <div className="space-y-3 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-purple-400" />
                    3. Mídia / Imagem (Opcional)
                  </label>
                  {formMedia && (
                    <button
                      type="button"
                      onClick={() => setFormMedia(null)}
                      className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remover Imagem
                    </button>
                  )}
                </div>
                
                {formMedia ? (
                  <div className="flex items-center gap-4 bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-neutral-950 border border-neutral-800 shrink-0">
                      <img
                        src={formMedia.url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM1MjUyNTIiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjkiIGN5PSI5IiByPSIyIi8+PHBhdGggZD0ibTIxIDE1LTMuMDgtMy4wOGExLjIgMS4yIDAgMCAwLTEuNzIgMGwtMS44MSAxLjgxIi8+PC9zdmc+';
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">
                        {formMedia.fileName || (formMedia.source === 'url' ? 'Imagem remota' : 'Upload local')}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
                        <span className="flex items-center gap-1">
                          {formMedia.source === 'upload' ? <Upload className="w-3 h-3" /> : <LinkIcon className="w-3 h-3" />}
                          {formMedia.source === 'upload' ? 'Upload' : 'URL Remota'}
                        </span>
                        {formMedia.size !== undefined && (
                          <span className="font-mono text-[10px]">{(formMedia.size / 1024).toFixed(1)} KB</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex bg-neutral-900 p-1 rounded-xl border border-neutral-800">
                      <button
                        type="button"
                        onClick={() => setMediaTab('upload')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${mediaTab === 'upload' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-300'}`}
                      >
                        Upload Local
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaTab('url')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${mediaTab === 'url' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-300'}`}
                      >
                        URL da Imagem
                      </button>
                    </div>
                    {mediaTab === 'upload' ? (
                      <div className="relative border-2 border-dashed border-neutral-800 hover:border-neutral-700 bg-neutral-900/50 rounded-xl p-6 text-center transition-colors">
                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={mediaUploading} />
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
                            {mediaUploading ? <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /> : <Upload className="w-5 h-5 text-neutral-400" />}
                          </div>
                          <p className="text-sm text-neutral-300 font-medium">
                            {mediaUploading ? 'Enviando...' : 'Clique ou arraste uma imagem (JPG, PNG, WebP)'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="url"
                          placeholder="https://exemplo.com/imagem.jpg"
                          value={mediaUrlInput}
                          onChange={(e) => setMediaUrlInput(e.target.value)}
                          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        />
                        <Button type="button" variant="secondary" onClick={handleAddMediaUrl}>Adicionar</Button>
                      </div>
                    )}
                    {mediaError && (
                      <p className="text-xs text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> {mediaError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Mensagem & Personalização */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    4. Mensagem & Personalização {formMedia && '(Opcional)'}
                  </label>
                  <div className="flex items-center gap-2">
                    {templates && templates.length > 0 && (
                      <select onChange={handleApplyTemplate} className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-neutral-300 text-xs focus:outline-none transition-colors max-w-[120px] truncate" defaultValue="">
                        <option value="" disabled>Usar Template</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setMessage((prev) => `${prev} {nome}`)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                      title="Inserir variável de nome"
                    >
                      <Sparkles className="w-3 h-3" />
                      + {'{nome}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMessage((prev) => `${prev} {Oi|Olá|Bom dia}`)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                      title="Inserir Spintax"
                    >
                      <Sparkles className="w-3 h-3" />
                      + Spintax
                    </button>
                  </div>
                </div>
                
                <textarea
                  placeholder="Olá {nome}, tudo bem? ..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[120px] resize-y transition-colors"
                />

                {templateToConfirm && (
                  <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between">
                    <span className="text-amber-400 text-[11px]">Substituir mensagem atual pelo template?</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setTemplateToConfirm(null)} className="px-3 py-1 text-[11px] text-neutral-400 hover:text-white transition-colors">Cancelar</button>
                      <button type="button" onClick={() => { 
                        const t = templates?.find(x => x.id === templateToConfirm); 
                        if (t) { setMessage(t.message); setFallbackName(t.fallbackName); } 
                        setTemplateToConfirm(null); 
                      }} className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-[11px] rounded transition-colors">Substituir</button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Fallback para {'{nome}'}:</label>
                    <input
                      type="text"
                      value={fallbackName}
                      onChange={(e) => setFallbackName(e.target.value)}
                      className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-32"
                    />
                  </div>
                  
                  {/* Dynamic Preview */}
                  <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold block mb-1">Preview (Exemplo)</span>
                    <p className="text-sm text-neutral-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {message || formMedia 
                        ? (message ? renderMessageTemplate(message, { jid: 'preview', name: 'João Silva' }, fallbackName) : '(Apenas imagem)') 
                        : <span className="text-neutral-600 italic">Escreva uma mensagem para ver o preview</span>}
                    </p>
                  </div>
                </div>
              </div>

              {/* 5. Programação */}
              <div className="space-y-3 pt-4 border-t border-neutral-800">
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  5. Programação
                </label>
                
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFormType('once')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-xl border transition-colors ${formType === 'once' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'}`}>
                    Envio Único
                  </button>
                  <button type="button" onClick={() => setFormType('daily')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-xl border transition-colors ${formType === 'daily' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'}`}>
                    Diário
                  </button>
                  <button type="button" onClick={() => setFormType('weekly')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-xl border transition-colors ${formType === 'weekly' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'}`}>
                    Semanal
                  </button>
                </div>

                <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 mt-2">
                  {formType === 'once' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-neutral-400 mb-1">Data</label>
                        <input
                          type="date"
                          value={formDate}
                          onChange={e => setFormDate(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-400 mb-1">Horário</label>
                        <input
                          type="time"
                          value={formTime}
                          onChange={e => setFormTime(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                        />
                      </div>
                    </div>
                  )}

                  {formType === 'daily' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1.5">Horários diários (ex: manhã e tarde):</label>
                        <div className="flex flex-wrap gap-2">
                          {formDailyTimes.map(time => (
                            <span
                              key={time}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 border border-emerald-500/30 text-emerald-300 font-mono text-xs"
                            >
                              <Clock className="w-3 h-3 text-emerald-400" />
                              {time}
                              {formDailyTimes.length > 1 && (
                                <button
                                  type="button"
                                  aria-label="Remover horário"
                                  onClick={() => setFormDailyTimes(prev => prev.filter(t => t !== time))}
                                  className="hover:text-rose-400 ml-1"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="time"
                          value={newDailyTimeInput}
                          onChange={e => setNewDailyTimeInput(e.target.value)}
                          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            if (newDailyTimeInput && !formDailyTimes.includes(newDailyTimeInput)) {
                              setFormDailyTimes(prev => [...prev, newDailyTimeInput].sort());
                            }
                          }}
                        >
                          Adicionar Horário
                        </Button>
                      </div>
                    </div>
                  )}

                  {formType === 'weekly' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1.5">Dias da semana ativos:</label>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEK_DAYS.map(day => {
                            const isSelected = formWeeklyDays.includes(day.id);
                            return (
                              <button
                                key={day.id}
                                type="button"
                                onClick={() => {
                                  setFormWeeklyDays(prev => {
                                    let next = [];
                                    if (prev.includes(day.id)) {
                                      next = prev.filter(d => d !== day.id);
                                    } else {
                                      next = [...prev, day.id].sort();
                                    }
                                    setFormWeeklySlots(slots => {
                                      let newSlots = slots.filter(s => next.includes(s.day));
                                      if (next.includes(day.id) && !prev.includes(day.id)) {
                                        newSlots.push({ day: day.id, times: ['08:00'] });
                                      }
                                      return newSlots.sort((a, b) => a.day - b.day);
                                    });
                                    if (!next.includes(selectedWeeklyDayForTimes) && next.length > 0) {
                                      setSelectedWeeklyDayForTimes(next[0]);
                                    }
                                    return next;
                                  });
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  isSelected
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:bg-neutral-800'
                                }`}
                              >
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {formWeeklyDays.length > 0 && (
                        <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded-xl">
                          <label className="block text-xs font-medium text-neutral-400 mb-2 flex items-center gap-2">
                            Horários para:
                            <select
                              value={selectedWeeklyDayForTimes}
                              onChange={e => setSelectedWeeklyDayForTimes(Number(e.target.value))}
                              className="bg-neutral-950 text-emerald-400 font-semibold focus:outline-none border border-neutral-800 rounded-md px-2 py-0.5 cursor-pointer"
                            >
                              {formWeeklyDays.map(d => (
                                <option key={d} value={d}>{WEEK_DAYS.find(w => w.id === d)?.full}</option>
                              ))}
                            </select>
                          </label>
                          
                          <div className="flex flex-wrap gap-2 mb-3">
                            {formWeeklySlots.find(s => s.day === selectedWeeklyDayForTimes)?.times.map(t => (
                              <span
                                key={t}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-neutral-950 border border-emerald-500/30 text-emerald-300 font-mono text-xs"
                              >
                                <Clock className="w-3 h-3 text-emerald-400" />
                                {t}
                                <button
                                  type="button"
                                  aria-label="Remover horário"
                                  onClick={() => {
                                    setFormWeeklySlots(prev => prev.map(s => {
                                      if (s.day === selectedWeeklyDayForTimes) {
                                        return { ...s, times: s.times.filter(time => time !== t) };
                                      }
                                      return s;
                                    }));
                                  }}
                                  className="hover:text-rose-400 ml-1"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          
                          <div className="flex gap-2">
                            <input
                              type="time"
                              value={newWeeklyTimeInput}
                              onChange={e => setNewWeeklyTimeInput(e.target.value)}
                              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                if (newWeeklyTimeInput) {
                                  setFormWeeklySlots(prev => prev.map(s => {
                                    if (s.day === selectedWeeklyDayForTimes && !s.times.includes(newWeeklyTimeInput)) {
                                      return { ...s, times: [...s.times, newWeeklyTimeInput].sort() };
                                    }
                                    return s;
                                  }));
                                }
                              }}
                            >
                              Adicionar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 6. Opções de Entrega */}
              <div className="space-y-3 pt-4 border-t border-neutral-800">
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  6. Opções de Entrega
                </label>
                <div className="space-y-4 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-2">Intervalo entre mensagens (segundos)</label>
                    <input
                      type="number"
                      min="1"
                      value={formIntervalSeconds}
                      onChange={e => setFormIntervalSeconds(Number(e.target.value))}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  
                  <div className="pt-2 border-t border-neutral-800/50">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={formBatchPauseEnabled}
                          onChange={e => setFormBatchPauseEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all group-hover:bg-neutral-700 peer-checked:group-hover:bg-emerald-400"></div>
                      </div>
                      <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">Pausar a cada lote (anti-spam)</span>
                    </label>
                  </div>
                  {formBatchPauseEnabled && (
                    <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-neutral-900/50 rounded-xl border border-neutral-800/80">
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Tamanho do lote (msgs)</label>
                        <input
                          type="number"
                          min="1"
                          value={formBatchSize}
                          onChange={e => setFormBatchSize(Number(e.target.value))}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Pausa (minutos)</label>
                        <input
                          type="number"
                          min="1"
                          value={formBatchPauseMinutes}
                          onChange={e => setFormBatchPauseMinutes(Number(e.target.value))}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </form>

            <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 shrink-0 flex items-center justify-end gap-3 rounded-b-3xl">
              <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" form="campaign-form" disabled={isSubmitting}>
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                ) : null}
                Salvar Rascunho
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results Modal */}
      {isResultsModalOpen && selectedResultsCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-neutral-800 shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-medium text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-500" />
                  Resultados da Campanha
                </h2>
                <p className="text-sm text-neutral-400 mt-1">
                  {selectedResultsCampaign.name}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar modal"
                onClick={handleCloseResults}
                className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {historyLoading && !summaries.length && !detail ? (
                <div className="flex items-center justify-center p-12">
                  <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                </div>
              ) : historyError ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <AlertTriangle className="w-8 h-8 text-rose-500 mb-3" />
                  <h3 className="text-lg font-medium text-white mb-1">Falha ao carregar resultados</h3>
                  <p className="text-sm text-neutral-400">{historyError}</p>
                </div>
              ) : detail ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Voltar ao histórico"
                      title="Voltar ao histórico"
                      onClick={() => fetchSummaries(selectedResultsCampaign.id)}
                      className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h3 className="text-lg font-medium text-white">Resumo da Execução</h3>
                      <p className="text-sm text-neutral-400">
                        {new Date(detail.executedAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="p-4 bg-neutral-900/50 rounded-2xl border border-neutral-800/50">
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Total</p>
                      <p className="text-2xl font-semibold text-white">{detail.totalTargets}</p>
                    </div>
                    <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                      <p className="text-xs font-medium text-emerald-500/70 uppercase tracking-wider mb-1">Enviados</p>
                      <p className="text-2xl font-semibold text-emerald-400">{detail.sentCount}</p>
                    </div>
                    <div className="p-4 bg-rose-500/5 rounded-2xl border border-rose-500/10">
                      <p className="text-xs font-medium text-rose-500/70 uppercase tracking-wider mb-1">Falhas</p>
                      <p className="text-2xl font-semibold text-rose-400">{detail.failedCount}</p>
                    </div>
                    <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                      <p className="text-xs font-medium text-amber-500/70 uppercase tracking-wider mb-1">Ignorados</p>
                      <p className="text-2xl font-semibold text-amber-400">{detail.skippedCount}</p>
                    </div>
                    <div className="p-4 bg-neutral-900/50 rounded-2xl border border-neutral-800/50">
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Taxa de Sucesso</p>
                      <p className="text-2xl font-semibold text-white">
                        {detail.totalTargets > 0 ? ((detail.sentCount / detail.totalTargets) * 100).toFixed(1) : '0.0'}%
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-neutral-300 mb-4 px-1">Destinatários</h4>
                    <div className="space-y-2">
                      {detail.details.map((d, i) => (
                        <div key={i} className="p-4 bg-neutral-900 rounded-2xl border border-neutral-800/50 flex flex-col gap-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-medium text-white">{d.targetLabel}</p>
                              <p className="text-xs text-neutral-500">{d.targetJid}</p>
                            </div>
                            <span className={`text-xs font-medium px-2 py-1 rounded-md ${
                              d.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400' :
                              d.status === 'failed' ? 'bg-rose-500/10 text-rose-400' :
                              'bg-amber-500/10 text-amber-400'
                            }`}>
                              {d.status === 'sent' ? 'Enviado' : d.status === 'failed' ? 'Falhou' : 'Ignorado'}
                            </span>
                          </div>
                          {d.sentAt && (
                            <p className="text-xs text-neutral-400 mt-1">
                              Enviado em: {new Date(d.sentAt).toLocaleString('pt-BR')}
                            </p>
                          )}
                          {d.messageId && (
                            <p className="text-xs text-neutral-500 font-mono mt-1">
                              ID da mensagem: {d.messageId}
                            </p>
                          )}
                          {d.error && (
                            <p className="text-xs text-rose-400 mt-1 p-2 bg-rose-500/5 rounded-lg border border-rose-500/10">
                              {d.error}
                            </p>
                          )}
                          {d.renderedPreview && (
                            <p className="text-xs text-neutral-400 mt-1 p-3 bg-black/40 rounded-xl border border-neutral-800 whitespace-pre-wrap">
                              {d.renderedPreview}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : summaries.length > 0 ? (
                <div className="space-y-8">
                  {/* Summary of latest execution */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-neutral-400 px-1 uppercase tracking-wider">Última Execução</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                      <div className="p-4 bg-neutral-900/50 rounded-2xl border border-neutral-800/50">
                        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Total</p>
                        <p className="text-2xl font-semibold text-white">{summaries[0].totalTargets}</p>
                      </div>
                      <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                        <p className="text-xs font-medium text-emerald-500/70 uppercase tracking-wider mb-1">Enviados</p>
                        <p className="text-2xl font-semibold text-emerald-400">{summaries[0].sentCount}</p>
                      </div>
                      <div className="p-4 bg-rose-500/5 rounded-2xl border border-rose-500/10">
                        <p className="text-xs font-medium text-rose-500/70 uppercase tracking-wider mb-1">Falhas</p>
                        <p className="text-2xl font-semibold text-rose-400">{summaries[0].failedCount}</p>
                      </div>
                      <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                        <p className="text-xs font-medium text-amber-500/70 uppercase tracking-wider mb-1">Ignorados</p>
                        <p className="text-2xl font-semibold text-amber-400">{summaries[0].skippedCount}</p>
                      </div>
                      <div className="p-4 bg-neutral-900/50 rounded-2xl border border-neutral-800/50">
                        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Taxa de Sucesso</p>
                        <p className="text-2xl font-semibold text-white">
                          {summaries[0].totalTargets > 0 ? ((summaries[0].sentCount / summaries[0].totalTargets) * 100).toFixed(1) : '0.0'}%
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-neutral-400 px-1 uppercase tracking-wider">Histórico de Execuções</h3>
                    <div className="space-y-2">
                      {summaries.map(s => (
                        <div key={s.id} className="p-4 bg-neutral-900/50 rounded-2xl border border-neutral-800 hover:border-neutral-700 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-white">{new Date(s.executedAt).toLocaleString('pt-BR')}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs">
                              <span className="text-neutral-400">{s.totalTargets} total</span>
                              <span className="text-emerald-400">{s.sentCount} enviados</span>
                              <span className="text-rose-400">{s.failedCount} falhas</span>
                            </div>
                          </div>
                          <Button variant="secondary" onClick={() => fetchDetail(s.campaignId, s.id)} className="shrink-0 text-xs">
                            Ver detalhes
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-12 h-12 bg-neutral-900 rounded-full flex items-center justify-center mb-4">
                    <BarChart3 className="w-6 h-6 text-neutral-500" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">Nenhuma execução registrada</h3>
                  <p className="text-sm text-neutral-400 max-w-sm">
                    Os resultados aparecerão aqui após a primeira execução da campanha.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

