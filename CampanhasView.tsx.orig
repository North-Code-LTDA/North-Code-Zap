import React, { useState, useMemo, type FormEvent, type ChangeEvent, useRef } from 'react';
import { 
  Megaphone, Plus, Search, Calendar, Clock, Image as ImageIcon,
  Play, Pause, Trash2, Edit3, X, AlertTriangle, Users, FileText,
  Upload, Trash
} from 'lucide-react';
import { useCampaigns } from '../hooks/useCampaigns';
import { useAudiences } from '../hooks/useAudiences';
import { Button } from './ui/Button';
import type { Campaign, CampaignScheduleConfig, DeliveryOptions, ScheduledMedia, ScheduleType, WeeklyTimeSlot } from '../types';

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
  const {
    state: campaigns, loading: campaignsLoading, error: campaignsError,
    createCampaign, updateCampaign, scheduleCampaign,
    pauseCampaign, resumeCampaign, unscheduleCampaign, deleteCampaign
  } = useCampaigns(selectedInstanceId);

  const { state: audiences } = useAudiences(selectedInstanceId);

  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  
  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [audienceListId, setAudienceListId] = useState('');
  const [message, setMessage] = useState('');
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
      const d = new Date(c.schedule.scheduledAt);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      setFormDate(`${yyyy}-${mm}-${dd}`);
      setFormTime(`${hh}:${min}`);
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
        const d = new Date(`${formDate}T${formTime}`);
        if (!isNaN(d.getTime())) {
          scheduledAt = d.toISOString();
        }
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-8 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Megaphone className="w-8 h-8 text-emerald-400" />
            Campanhas
          </h1>
          <p className="text-neutral-400 mt-1">
            Gerencie envios em massa e disparos para suas listas de audiência.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="bg-emerald-500 hover:bg-emerald-600 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {(actionError || campaignsError) && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-rose-400 mr-3 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-400">
            <span className="font-semibold block mb-1">Ocorreu um erro</span>
            {actionError || campaignsError}
          </div>
          <button onClick={() => setActionError(null)} className="ml-auto text-rose-400 hover:text-rose-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 flex-shrink-0">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <p className="text-sm font-medium text-neutral-400">Total</p>
          <p className="text-2xl font-bold text-white mt-1">{metrics.total}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <p className="text-sm font-medium text-neutral-400">Rascunhos</p>
          <p className="text-2xl font-bold text-neutral-300 mt-1">{metrics.drafts}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-sm font-medium text-emerald-500">Ativas</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{metrics.active}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-500">Pausadas</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{metrics.paused}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 mb-6 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar campanhas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-2">
        {campaignsLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center border border-neutral-800 border-dashed rounded-2xl bg-neutral-900/20">
            <div className="w-12 h-12 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 mb-4">
              <Megaphone className="w-6 h-6 text-neutral-500" />
            </div>
            <h3 className="text-lg font-medium text-white mb-1">Nenhuma campanha</h3>
            <p className="text-sm text-neutral-400">
              {search ? 'Nenhuma campanha corresponde à busca.' : 'Crie sua primeira campanha de disparos em massa.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredCampaigns.map(c => {
              const isDraft = c.scheduleId === null;
              // Derive status by reading it from the scheduler if not draft.
              // Note: we can't easily poll scheduler state here so we just trust if it has scheduleId it's "scheduled" unless backend extends status.
              // The backend currently exposes "status" in the campaigns endpoint if we joined it, or we just call it "Agendada".
              // Let's assume the API returns status or we just show "Agendada".
              const backendStatus = isDraft ? 'draft' : ((c as any).status || 'missing_schedule');
              const { label: statusLabel, color: statusColor } = getStatusPresentation(backendStatus);

              return (
                <div key={c.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col gap-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-medium text-white mb-1">{c.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border ${statusColor}`}>
                          {statusLabel}
                        </span>
                        <span className="text-xs text-neutral-500 font-mono">
                          {c.schedule.scheduleType.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDraft ? (
                        <>
                          <Button className="h-8 px-3 text-xs bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => handleSchedule(c.id)}>
                            <Play className="w-3.5 h-3.5 mr-1.5" /> Agendar Disparo
                          </Button>
                          <Button variant="secondary" className="h-8 w-8 p-0 border-neutral-700" onClick={() => handleOpenEdit(c)}>
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          {(backendStatus === 'active' || backendStatus === 'running') && (
                            <Button variant="secondary" className="h-8 px-3 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10" onClick={() => handlePause(c.id)}>
                              <Pause className="w-3.5 h-3.5 mr-1.5" /> Pausar
                            </Button>
                          )}
                          {backendStatus === 'paused' && (
                            <Button className="h-8 px-3 text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20" onClick={() => handleResume(c.id)}>
                              <Play className="w-3.5 h-3.5 mr-1.5" /> Retomar
                            </Button>
                          )}
                          <Button variant="secondary" className="h-8 px-3 text-xs border-neutral-700" onClick={() => handleUnschedule(c.id)}>
                            <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Voltar Rascunho
                          </Button>
                        </>
                      )}
                      
                      {deleteConfirm === c.id ? (
                        <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => handleDelete(c.id)}>
                          Confirmar
                        </Button>
                      ) : (
                        <Button variant="ghost" className="h-8 w-8 p-0 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10" onClick={() => setDeleteConfirm(c.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-neutral-950/50 p-4 rounded-xl border border-neutral-800/50">
                    <div>
                      <p className="text-xs text-neutral-500 mb-1 flex items-center">
                        <Users className="w-3.5 h-3.5 mr-1.5" /> Audiência
                      </p>
                      {c.audienceSnapshot ? (
                        <p className="text-sm text-neutral-200">{c.audienceSnapshot.listName} <span className="text-neutral-500 text-xs">({c.audienceSnapshot.targetCount} contatos)</span></p>
                      ) : (
                        <p className="text-sm text-neutral-500">
                          {c.audienceListId ? audiences?.lists.find(l => l.id === c.audienceListId)?.name || 'Lista configurada' : 'Não definida'}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 mb-1 flex items-center">
                        <Calendar className="w-3.5 h-3.5 mr-1.5" /> Programação
                      </p>
                      <p className="text-sm text-neutral-200">
                        {c.schedule.scheduleType === 'once' ? (
                          c.schedule.scheduledAt ? new Date(c.schedule.scheduledAt).toLocaleString() : 'Sem data'
                        ) : (
                          `Recorrente (${c.schedule.scheduleType})`
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {!(isDraft) && (
                    <div className="text-xs text-neutral-500 flex items-center">
                      <FileText className="w-3.5 h-3.5 mr-1.5" />
                      Para editar conteúdo, audiência ou programação, volte a campanha para rascunho.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-neutral-800">
              <h2 className="text-xl font-semibold text-white">
                {editingId ? 'Editar Rascunho' : 'Nova Campanha'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {actionError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400 flex items-start">
                  <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                  <div>{actionError}</div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">Nome da Campanha</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Black Friday 2026"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">Lista de Audiência</label>
                  <select
                    value={audienceListId}
                    onChange={e => setAudienceListId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  >
                    <option value="">Selecione uma lista...</option>
                    {audiences?.lists.map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.contactJids.length} contatos)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">Mensagem</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={4}
                    placeholder="Olá {{nome}}, temos uma oferta..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">Nome de Fallback</label>
                  <input
                    type="text"
                    value={fallbackName}
                    onChange={e => setFallbackName(e.target.value)}
                    placeholder="amigo(a)"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                  <p className="text-xs text-neutral-500 mt-1">Usado quando o contato não possui nome salvo.</p>
                </div>

                <div className="pt-4 border-t border-neutral-800">
                  <label className="block text-sm font-medium text-neutral-300 mb-3">Mídia (Opcional)</label>
                  
                  {!formMedia ? (
                    <div className="space-y-4">
                      <div className="flex bg-neutral-950 rounded-lg p-1 border border-neutral-800">
                        <button
                          onClick={() => setMediaTab('upload')}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${mediaTab === 'upload' ? 'bg-neutral-800 text-white' : 'text-neutral-400'}`}
                        >
                          Fazer Upload
                        </button>
                        <button
                          onClick={() => setMediaTab('url')}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${mediaTab === 'url' ? 'bg-neutral-800 text-white' : 'text-neutral-400'}`}
                        >
                          Usar URL
                        </button>
                      </div>

                      {mediaTab === 'upload' ? (
                        <div>
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                          <Button variant="secondary" className="w-full h-24 border-dashed bg-neutral-900/50" onClick={() => fileInputRef.current?.click()} disabled={mediaUploading}>
                            {mediaUploading ? (
                              <div className="w-5 h-5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-neutral-400">
                                <Upload className="w-5 h-5" />
                                <span className="text-xs">Clique para enviar arquivo</span>
                              </div>
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input type="text" value={mediaUrlInput} onChange={e => setMediaUrlInput(e.target.value)} placeholder="https://..." className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 text-sm text-white" />
                          <Button variant="secondary" onClick={handleAddMediaUrl}>Adicionar</Button>
                        </div>
                      )}
                      
                      {mediaError && <p className="text-xs text-rose-400">{mediaError}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-neutral-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-neutral-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white truncate max-w-[200px]">
                            {formMedia.source === 'upload' ? formMedia.fileName : 'Mídia por URL'}
                          </p>
                          <p className="text-xs text-neutral-500">{formMedia.source === 'upload' ? 'Upload Local' : formMedia.url}</p>
                        </div>
                      </div>
                      <Button variant="ghost" className="h-8 w-8 p-0 text-rose-400 hover:bg-rose-500/10" onClick={() => setFormMedia(null)}>
                        <Trash className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-neutral-800">
                  <label className="block text-sm font-medium text-neutral-300 mb-3">Agendamento</label>
                  
                  <div className="flex bg-neutral-950 rounded-lg p-1 border border-neutral-800 mb-4">
                    <button
                      onClick={() => setFormType('once')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${formType === 'once' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-300'}`}
                    >
                      Único
                    </button>
                    <button
                      onClick={() => setFormType('daily')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${formType === 'daily' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-300'}`}
                    >
                      Diário
                    </button>
                    <button
                      onClick={() => setFormType('weekly')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${formType === 'weekly' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-300'}`}
                    >
                      Semanal
                    </button>
                  </div>

                  {formType === 'once' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Data</label>
                        <input
                          type="date"
                          value={formDate}
                          onChange={e => setFormDate(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Horário</label>
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
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-2">Horários de Disparo Diário</label>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {formDailyTimes.map(t => (
                            <div key={t} className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-md pl-2 pr-1 py-1">
                              <span className="text-xs text-neutral-300 font-mono">{t}</span>
                              <button
                                onClick={() => setFormDailyTimes(prev => prev.filter(time => time !== t))}
                                className="p-0.5 text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 rounded"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="time"
                            value={newDailyTimeInput}
                            onChange={e => setNewDailyTimeInput(e.target.value)}
                            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                          />
                          <Button
                            variant="secondary"
                            onClick={() => {
                              if (newDailyTimeInput && !formDailyTimes.includes(newDailyTimeInput)) {
                                setFormDailyTimes(prev => [...prev, newDailyTimeInput].sort());
                              }
                            }}
                          >
                            Adicionar
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {formType === 'weekly' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-2">Dias da Semana</label>
                        <div className="flex flex-wrap gap-2">
                          {WEEK_DAYS.map(day => {
                            const isSelected = formWeeklyDays.includes(day.id);
                            return (
                              <button
                                key={day.id}
                                onClick={() => {
                                  let newDays;
                                  if (isSelected) {
                                    newDays = formWeeklyDays.filter(d => d !== day.id);
                                    setFormWeeklySlots(prev => prev.filter(s => s.day !== day.id));
                                    if (selectedWeeklyDayForTimes === day.id && newDays.length > 0) {
                                      setSelectedWeeklyDayForTimes(newDays[0]);
                                    }
                                  } else {
                                    newDays = [...formWeeklyDays, day.id].sort();
                                    setFormWeeklySlots(prev => [...prev, { day: day.id, times: ['08:00'] }].sort((a,b) => a.day - b.day));
                                    setSelectedWeeklyDayForTimes(day.id);
                                  }
                                  setFormWeeklyDays(newDays);
                                }}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                                  isSelected 
                                    ? 'bg-emerald-500 text-white' 
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
                        <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                          <label className="block text-xs font-medium text-neutral-500 mb-2">
                            Horários para: <select 
                              value={selectedWeeklyDayForTimes}
                              onChange={e => setSelectedWeeklyDayForTimes(Number(e.target.value))}
                              className="bg-transparent text-emerald-400 font-semibold focus:outline-none"
                            >
                              {formWeeklyDays.map(d => (
                                <option key={d} value={d} className="bg-neutral-900">{WEEK_DAYS.find(w => w.id === d)?.full}</option>
                              ))}
                            </select>
                          </label>
                          
                          <div className="flex flex-wrap gap-2 mb-3">
                            {formWeeklySlots.find(s => s.day === selectedWeeklyDayForTimes)?.times.map(t => (
                              <div key={t} className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-md pl-2 pr-1 py-1">
                                <span className="text-xs text-neutral-300 font-mono">{t}</span>
                                <button
                                  onClick={() => {
                                    setFormWeeklySlots(prev => prev.map(s => {
                                      if (s.day === selectedWeeklyDayForTimes) {
                                        return { ...s, times: s.times.filter(time => time !== t) };
                                      }
                                      return s;
                                    }));
                                  }}
                                  className="p-0.5 text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
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

                <div className="pt-4 border-t border-neutral-800">
                  <label className="block text-sm font-medium text-neutral-300 mb-3">Opções de Entrega</label>
                  <div className="space-y-4 bg-neutral-900/30 p-4 rounded-xl border border-neutral-800/50">
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
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={formBatchPauseEnabled}
                            onChange={e => setFormBatchPauseEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                        </div>
                        <span className="text-sm text-neutral-300">Pausar a cada lote (anti-spam)</span>
                      </label>
                    </div>

                    {formBatchPauseEnabled && (
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Tamanho do lote</label>
                          <input
                            type="number"
                            min="1"
                            value={formBatchSize}
                            onChange={e => setFormBatchSize(Number(e.target.value))}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Pausa (minutos)</label>
                          <input
                            type="number"
                            min="1"
                            value={formBatchPauseMinutes}
                            onChange={e => setFormBatchPauseMinutes(Number(e.target.value))}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
            
            <div className="flex items-center justify-end p-6 border-t border-neutral-800 space-x-3 bg-neutral-900/50 rounded-b-2xl">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveDraft} disabled={isSubmitting} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                ) : null}
                Salvar Rascunho
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
