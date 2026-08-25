import React, { useState, useMemo } from 'react';
import { 
  Megaphone, Plus, Search, Calendar, Clock, Image as ImageIcon,
  Play, Pause, Trash2, Edit3, X, AlertTriangle, Users, FileText
} from 'lucide-react';
import { useCampaigns } from '../hooks/useCampaigns';
import { useAudiences } from '../hooks/useAudiences';
import { Button } from './ui/Button';
import type { Campaign, CampaignScheduleConfig, DeliveryOptions, ScheduledMedia } from '../types';

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
  // We keep scheduling simple for this phase
  const [scheduleType, setScheduleType] = useState<'once' | 'daily' | 'weekly'>('once');
  const [scheduledAt, setScheduledAt] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setAudienceListId('');
    setMessage('');
    setFallbackName('amigo(a)');
    setScheduleType('once');
    setScheduledAt('');
    setActionError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (c: Campaign) => {
    resetForm();
    setEditingId(c.id);
    setName(c.name);
    setAudienceListId(c.audienceListId || '');
    setMessage(c.message);
    setFallbackName(c.fallbackName);
    setScheduleType(c.schedule.scheduleType);
    if (c.schedule.scheduleType === 'once' && c.schedule.scheduledAt) {
      // Input datetime-local expects YYYY-MM-DDThh:mm format
      setScheduledAt(c.schedule.scheduledAt.substring(0, 16));
    }
    setIsModalOpen(true);
  };

  const handleError = (e: any) => {
    setActionError(e.message || 'Erro inesperado');
    setTimeout(() => setActionError(null), 5000);
  };

  const handleSaveDraft = async () => {
    if (!selectedInstanceId) return;
    
    const schedule: CampaignScheduleConfig = {
      scheduleType,
      scheduledAt: scheduleType === 'once' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      dailyTimes: [],
      weeklyTimeSlots: [],
      deliveryOptions: {
        intervalBetweenMessagesMs: 5000,
        batchPauseEnabled: false,
        batchSize: 5,
        batchPauseMs: 300000
      }
    };
    
    try {
      if (editingId) {
        await updateCampaign(editingId, {
          name, audienceListId: audienceListId || null, message, fallbackName, schedule
        });
      } else {
        await createCampaign({
          instanceId: selectedInstanceId,
          name, audienceListId: audienceListId || null, message, fallbackName, schedule
        });
      }
      setIsModalOpen(false);
    } catch (e: any) {
      handleError(e);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await scheduleCampaign(id);
    } catch (e: any) {
      handleError(e);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await pauseCampaign(id);
    } catch (e: any) {
      handleError(e);
    }
  };

  const handleResume = async (id: string) => {
    try {
      await resumeCampaign(id);
    } catch (e: any) {
      handleError(e);
    }
  };

  const handleUnschedule = async (id: string) => {
    try {
      await unscheduleCampaign(id);
    } catch (e: any) {
      handleError(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCampaign(id);
      setDeleteConfirm(null);
    } catch (e: any) {
      handleError(e);
    }
  };

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    let list = campaigns;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || (c.audienceSnapshot?.listName.toLowerCase().includes(q)));
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [campaigns, search]);

  const metrics = useMemo(() => {
    if (!campaigns) return { total: 0, drafts: 0, active: 0, paused: 0 };
    return {
      total: campaigns.length,
      drafts: campaigns.filter(c => c.scheduleId === null).length,
      active: campaigns.filter(c => (c as any).status === 'active' || (c as any).status === 'running').length,
      paused: campaigns.filter(c => (c as any).status === 'paused').length
    };
  }, [campaigns]);

  const translateStatus = (s: string) => {
    switch (s) {
      case 'draft': return { label: 'Rascunho', color: 'bg-neutral-800 text-neutral-400 border-neutral-700' };
      case 'active': return { label: 'Ativa', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'running': return { label: 'Executando', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
      case 'paused': return { label: 'Pausada', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'completed': return { label: 'Concluída', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
      case 'error': return { label: 'Erro', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      case 'missing_schedule': return { label: 'Agendamento Ausente', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      default: return { label: s, color: 'bg-neutral-800 text-neutral-400 border-neutral-700' };
    }
  };

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500">
        <Megaphone className="w-12 h-12 mb-4 opacity-50" />
        <p>Selecione uma instância para gerenciar campanhas</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-neutral-950 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <Megaphone className="w-6 h-6 mr-3 text-emerald-400" />
            Campanhas
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Organize e programe ações de comunicação para suas audiências.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl">
          <Plus className="w-4 h-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {actionError && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center shadow-lg">
          <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" />
          <span className="text-sm font-medium">{actionError}</span>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: metrics.total, color: 'text-white', bg: 'bg-neutral-900 border-neutral-800' },
          { label: 'Rascunhos', value: metrics.drafts, color: 'text-neutral-400', bg: 'bg-neutral-900 border-neutral-800' },
          { label: 'Ativas', value: metrics.active, color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/10' },
          { label: 'Pausadas', value: metrics.paused, color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/10' },
        ].map((m, i) => (
          <div key={i} className={`p-4 rounded-2xl border ${m.bg}`}>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">{m.label}</p>
            <p className={`text-2xl font-semibold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search & List */}
      <div className="flex-1 flex flex-col min-h-0 space-y-4">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1 max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-neutral-500" />
            </div>
            <input
              type="text"
              placeholder="Buscar campanhas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-neutral-800 rounded-xl leading-5 bg-neutral-900 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
            />
          </div>
        </div>

        {campaignsLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-neutral-800 rounded-2xl p-12">
            <Megaphone className="w-12 h-12 text-neutral-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-1">Nenhuma campanha encontrada</h3>
            <p className="text-neutral-500 mb-6 text-center max-w-sm">
              Crie sua primeira campanha para agendar disparos para suas audiências de forma organizada.
            </p>
            <Button onClick={openCreate} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20">
              <Plus className="w-4 h-4 mr-2" />
              Criar primeira campanha
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 overflow-y-auto pr-2 pb-12">
            {filtered.map(c => {
              const statusObj = translateStatus((c as any).status);
              const isDraft = c.scheduleId === null;
              
              return (
                <div key={c.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-white">{c.name}</h3>
                      <div className="flex items-center space-x-2 mt-1.5 text-xs text-neutral-500">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wider ${statusObj.color}`}>
                          {statusObj.label}
                        </span>
                        <span>•</span>
                        <span className="flex items-center">
                          <Clock className="w-3.5 h-3.5 mr-1" />
                          Atualizada em {new Date(c.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center space-x-1">
                      {isDraft ? (
                        <>
                          <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => openEdit(c)}>
                            <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Editar
                          </Button>
                          <Button className="h-8 px-3 text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20" onClick={() => handlePublish(c.id)}>
                            <Play className="w-3.5 h-3.5 mr-1.5" /> Agendar
                          </Button>
                        </>
                      ) : (
                        <>
                          {((c as any).status === 'active' || (c as any).status === 'running') && (
                            <Button variant="secondary" className="h-8 px-3 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10" onClick={() => handlePause(c.id)}>
                              <Pause className="w-3.5 h-3.5 mr-1.5" /> Pausar
                            </Button>
                          )}
                          {(c as any).status === 'paused' && (
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

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">Agendamento (Apenas Único nesta fase)</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end p-6 border-t border-neutral-800 space-x-3 bg-neutral-900/50 rounded-b-2xl">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveDraft} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Salvar Rascunho
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
