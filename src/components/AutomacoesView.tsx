import React, { useState, useMemo, useEffect } from 'react';
import { 
  Zap, Plus, Search, Edit3, Trash2, X, Play, Pause, 
  MessageSquare, FileText, AlertTriangle, Users, Tag
} from 'lucide-react';
import { useAutomations } from '../hooks/useAutomations';
import { useAudiences } from '../hooks/useAudiences';
import { useTemplates } from '../hooks/useTemplates';
import { Button } from './ui/Button';
import type { Automation, AutomationTrigger } from '../types';
import { renderMessageTemplate } from '../utils/template';

interface AutomacoesViewProps {
  selectedInstanceId: string | null;
}

export function AutomacoesView({ selectedInstanceId }: AutomacoesViewProps) {
  const { automations, loading, error, createAutomation, updateAutomation, deleteAutomation } = useAutomations(selectedInstanceId);
  const { state: audienceState } = useAudiences(selectedInstanceId);
  const lists = audienceState?.lists || [];
  const tags = audienceState?.tags || [];
  const { templates } = useTemplates();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formTriggerType, setFormTriggerType] = useState<'contact_added_to_list' | 'tag_added_to_contact'>('contact_added_to_list');
  const [formTriggerResource, setFormTriggerResource] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formFallbackName, setFormFallbackName] = useState('amigo(a)');
  const [formEnabled, setFormEnabled] = useState(true);
  
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const [templateConfirmation, setTemplateConfirmation] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const resetErrors = () => {
    setFormError(null);
    setActionError(null);
    setDeleteError(null);
  };

  useEffect(() => {
    setIsModalOpen(false);
    setEditingId(null);
    setDeleteConfirmation(null);
    setTemplateConfirmation(null);
    resetErrors();
  }, [selectedInstanceId]);

  // Scroll lock
  useEffect(() => {
    if (!isModalOpen && !deleteConfirmation && !templateConfirmation) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen, deleteConfirmation, templateConfirmation]);

  const metrics = useMemo(() => {
    const total = automations.length;
    const active = automations.filter(a => a.enabled).length;
    const paused = total - active;
    return { total, active, paused };
  }, [automations]);

  const filteredAutomations = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return automations;
    return automations.filter(a => {
      if (a.name.toLowerCase().includes(s)) return true;
      if (a.message.toLowerCase().includes(s)) return true;
      if (a.trigger.type === 'contact_added_to_list') {
        const l = lists.find(list => list.id === (a.trigger as any).listId);
        if (l && l.name.toLowerCase().includes(s)) return true;
      }
      if (a.trigger.type === 'tag_added_to_contact') {
        const t = tags.find(tag => tag.id === (a.trigger as any).tagId);
        if (t && t.name.toLowerCase().includes(s)) return true;
      }
      return false;
    });
  }, [automations, search, lists, tags]);

  const openNew = () => {
    resetErrors();
    setFormName('');
    setFormTriggerType('contact_added_to_list');
    setFormTriggerResource('');
    setFormMessage('');
    setFormFallbackName('amigo(a)');
    setFormEnabled(true);
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (a: Automation) => {
    resetErrors();
    setFormName(a.name);
    setFormTriggerType(a.trigger.type);
    setFormTriggerResource(
      a.trigger.type === 'contact_added_to_list' 
        ? (a.trigger as any).listId 
        : (a.trigger as any).tagId
    );
    setFormMessage(a.message);
    setFormFallbackName(a.fallbackName);
    setFormEnabled(a.enabled);
    setEditingId(a.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetErrors();
  };

  const insertVariable = (variable: string) => {
    setFormMessage(prev => {
      const textarea = document.getElementById('automation-message-input') as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = prev.substring(0, start);
        const after = prev.substring(end);
        
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + variable.length, start + variable.length);
        }, 0);
        
        return before + variable + after;
      }
      return prev + variable;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || !formMessage.trim() || !formTriggerResource || !formFallbackName.trim()) {
      setFormError('Preencha todos os campos obrigatórios.');
      return;
    }

    const trigger: AutomationTrigger = formTriggerType === 'contact_added_to_list'
      ? { type: 'contact_added_to_list', listId: formTriggerResource }
      : { type: 'tag_added_to_contact', tagId: formTriggerResource };

    try {
      if (editingId) {
        await updateAutomation(editingId, {
          name: formName,
          enabled: formEnabled,
          trigger,
          message: formMessage,
          fallbackName: formFallbackName
        });
      } else {
        await createAutomation({
          name: formName,
          enabled: formEnabled,
          trigger,
          message: formMessage,
          fallbackName: formFallbackName
        });
      }
      closeModal();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar automação');
    }
  };

  const toggleEnabled = async (a: Automation) => {
    setActionError(null);
    try {
      await updateAutomation(a.id, { enabled: !a.enabled });
    } catch (err: any) {
      setActionError(err.message || 'Erro ao alterar status');
    }
  };

  const openDelete = (id: string) => {
    resetErrors();
    setDeleteConfirmation(id);
  };

  const handleDelete = async () => {
    if (!deleteConfirmation) return;
    setDeleteError(null);
    try {
      await deleteAutomation(deleteConfirmation);
      setDeleteConfirmation(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao excluir automação');
    }
  };

  const applyTemplate = (tId: string) => {
    const t = templates.find(x => x.id === tId);
    if (!t) return;
    
    if (formMessage.trim()) {
      setTemplateConfirmation(t.id);
    } else {
      setFormMessage(t.message);
      setFormFallbackName(t.fallbackName);
    }
  };

  const confirmApplyTemplate = () => {
    if (!templateConfirmation) return;
    const t = templates.find(x => x.id === templateConfirmation);
    if (t) {
      setFormMessage(t.message);
      setFormFallbackName(t.fallbackName);
    }
    setTemplateConfirmation(null);
  };

  const getResourceName = (a: Automation) => {
    if (a.trigger.type === 'contact_added_to_list') {
      const l = lists.find(list => list.id === (a.trigger as any).listId);
      return l ? l.name : null;
    } else {
      const t = tags.find(tag => tag.id === (a.trigger as any).tagId);
      return t ? t.name : null;
    }
  };

  const selectedListObj = lists.find(l => l.id === formTriggerResource);

  const generatedPreview = useMemo(() => {
    if (!formMessage.trim()) return '';
    return renderMessageTemplate(
      formMessage,
      {
        jid: 'preview',
        name: 'João Silva',
        type: 'person',
        label: 'João Silva',
        source: 'directory'
      },
      formFallbackName || 'amigo(a)',
      { seed: 'automation-preview' }
    );
  }, [formMessage, formFallbackName]);

  const automationToDeleteObj = automations.find(a => a.id === deleteConfirmation);

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4 animate-in fade-in duration-500">
        <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4 shadow-xl">
          <Zap className="w-8 h-8 text-neutral-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Instância Não Selecionada</h2>
        <p className="text-neutral-400 max-w-md">
          Selecione ou conecte uma instância do WhatsApp no painel lateral para gerenciar Automações.
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
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Automações
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Envie mensagens automaticamente quando seus contatos entrarem em listas ou receberem tags.
              </p>
            </div>
          </div>
          <Button onClick={openNew} variant="primary" className="shrink-0">
            <Plus className="w-5 h-5 mr-2" />
            Nova Automação
          </Button>
        </div>
      </div>

      {(actionError || error) && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-sm text-rose-400 font-medium">
            {actionError || error}
          </p>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Total de Automações</p>
            <p className="text-2xl font-bold text-white mt-0.5">{metrics.total}</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Play className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Ativas</p>
            <p className="text-2xl font-bold text-emerald-400 mt-0.5">{metrics.active}</p>
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
            placeholder="Buscar automações..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-48 text-neutral-400">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          Carregando automações...
        </div>
      ) : filteredAutomations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-neutral-900/50 border border-neutral-800 border-dashed rounded-2xl">
          <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Nenhuma automação criada</h3>
          <p className="text-neutral-400 max-w-sm mb-6">
            Crie uma automação para enviar mensagens quando seus contatos entrarem em listas ou receberem tags.
          </p>
          {!search && (
            <Button onClick={openNew} variant="primary">
              <Plus className="w-4 h-4 mr-2" />
              Criar primeira automação
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAutomations.map(a => {
            const resourceName = getResourceName(a);
            return (
              <div key={a.id} className="bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700/90 rounded-2xl p-5 shadow-sm flex flex-col gap-4 transition-all">
                <div className="flex items-start justify-between min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h3 className="font-bold text-white truncate pr-2" title={a.name}>{a.name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.enabled ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-amber-500/10 text-amber-400 border-amber-500/20">
                          Pausada
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={a.enabled ? "Pausar" : "Ativar"}
                      title={a.enabled ? "Pausar" : "Ativar"}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                      onClick={() => toggleEnabled(a)}
                    >
                      {a.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      aria-label="Editar"
                      title="Editar automação"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                      onClick={() => openEdit(a)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir"
                      title="Excluir automação"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
                      onClick={() => openDelete(a.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="bg-neutral-950/40 rounded-xl p-3 border border-neutral-800/50">
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
                    {a.trigger.type === 'contact_added_to_list' ? (
                      <><Users className="w-3.5 h-3.5" /> GATILHO: Contato adicionado à lista</>
                    ) : (
                      <><Tag className="w-3.5 h-3.5" /> GATILHO: Tag adicionada ao contato</>
                    )}
                  </div>
                  {resourceName ? (
                    <div className="text-sm font-medium text-neutral-300 truncate">
                      {a.trigger.type === 'contact_added_to_list' ? 'LISTA: ' : 'TAG: '}
                      {resourceName}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 mt-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5" /> Gatilho indisponível
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Mensagem</div>
                  <div className="text-sm text-neutral-400 line-clamp-3 italic">
                    {renderMessageTemplate(
                      a.message,
                      { type: 'person', jid: '', label: 'João', name: 'João', source: 'directory' },
                      a.fallbackName,
                      { seed: 'preview' }
                    )}
                  </div>
                </div>

                {a.updatedAt && (
                  <div className="pt-3 mt-auto border-t border-neutral-800 flex justify-between items-center text-xs text-neutral-500">
                    Atualizado em {new Date(a.updatedAt).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nova/Editar Automação */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 p-4 sm:p-6 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] flex flex-col bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {editingId ? 'Editar Automação' : 'Nova Automação'}
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">Configure o gatilho e a mensagem que será enviada automaticamente.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 bg-neutral-800/80 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors"
                title="Fechar modal"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden overscroll-contain p-6 space-y-6">
              {formError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <form id="automation-form" onSubmit={handleSave} className="space-y-6">
                
                {/* 1. Nome e Status */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                        1. Nome da Automação *
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Ex: Boas-vindas novos leads"
                        className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="sm:w-48">
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2 text-transparent sm:text-neutral-300 sm:select-text select-none">
                        Status Inicial
                      </label>
                      <select
                        value={formEnabled ? 'true' : 'false'}
                        onChange={(e) => setFormEnabled(e.target.value === 'true')}
                        className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="true">Ativa</option>
                        <option value="false">Pausada</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Gatilho */}
                <div className="bg-neutral-950 p-4 sm:p-5 rounded-2xl border border-neutral-800 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    2. Gatilho <span className="text-neutral-500 font-normal">(Quando isso acontecer)</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">
                        Evento *
                      </label>
                      <select
                        value={formTriggerType}
                        onChange={(e) => {
                          setFormTriggerType(e.target.value as any);
                          setFormTriggerResource('');
                        }}
                        className="w-full px-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="contact_added_to_list">Contato adicionado a uma Lista</option>
                        <option value="tag_added_to_contact">Tag adicionada a um Contato</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">
                        {formTriggerType === 'contact_added_to_list' ? 'Lista *' : 'Tag *'}
                      </label>
                      <select
                        required
                        value={formTriggerResource}
                        onChange={(e) => setFormTriggerResource(e.target.value)}
                        className="w-full px-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="" disabled>Selecione...</option>
                        {formTriggerType === 'contact_added_to_list' && lists.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                        {formTriggerType === 'tag_added_to_contact' && tags.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {formTriggerType === 'contact_added_to_list' && formTriggerResource && selectedListObj && (
                    <div className="mt-2 text-xs text-neutral-400 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      A automação será disparada quando alguém entrar em <span className="text-neutral-200 font-medium">{selectedListObj.name}</span> ({selectedListObj.contactJids.length} contatos)
                    </div>
                  )}
                  {formTriggerType === 'tag_added_to_contact' && formTriggerResource && (
                    <div className="mt-2 text-xs text-neutral-400 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      A automação será disparada quando a tag <span className="text-neutral-200 font-medium">{tags.find(t => t.id === formTriggerResource)?.name}</span> for adicionada.
                    </div>
                  )}
                </div>

                {/* 3. Mensagem */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      3. Mensagem & Personalização
                    </label>
                    {templates.length > 0 && (
                      <div className="flex items-center gap-2 sm:w-auto w-full">
                        <span className="text-xs text-neutral-500 shrink-0">Template opcional:</span>
                        <select
                          className="flex-1 sm:flex-none text-sm px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl focus:outline-none focus:border-emerald-500 text-white"
                          onChange={(e) => {
                            if (e.target.value) applyTemplate(e.target.value);
                            e.target.value = '';
                          }}
                          value=""
                        >
                          <option value="" disabled>Selecione um template...</option>
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => insertVariable('{nome}')}
                        className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs rounded border border-emerald-500/20 transition-colors font-mono"
                      >
                        + {'{nome}'}
                      </button>
                      <button
                        type="button"
                        onClick={() => insertVariable('{Oi|Olá|Bom dia}')}
                        className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded border border-neutral-700 transition-colors font-mono"
                      >
                        + Spintax
                      </button>
                    </div>
                    <textarea
                      id="automation-message-input"
                      required
                      value={formMessage}
                      onChange={(e) => setFormMessage(e.target.value)}
                      placeholder="Olá {nome}, tudo bem?"
                      className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 min-h-[150px] resize-y font-sans transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
                      Fallback para Nome <span className="text-neutral-500 font-normal normal-case">(se contato sem nome)</span> *
                    </label>
                    <input
                      type="text"
                      required
                      value={formFallbackName}
                      onChange={(e) => setFormFallbackName(e.target.value)}
                      placeholder="Ex: amigo(a), cliente"
                      className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  {/* Preview Section */}
                  <div className="pt-4 mt-4 border-t border-neutral-800">
                    <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-4">
                      <div className="text-[10px] uppercase text-neutral-500 font-medium mb-3 tracking-wider">Preview</div>
                      {formMessage.trim() ? (
                        <div className="relative inline-block bg-[#005c4b] text-[#e9edef] px-3 py-2 rounded-lg max-w-[85%] whitespace-pre-wrap text-sm shadow-sm">
                          {generatedPreview}
                          <span className="float-right ml-3 mt-2 text-[10px] text-[#8696a0]">12:00</span>
                        </div>
                      ) : (
                        <div className="text-neutral-500 italic text-sm">
                          Escreva uma mensagem para ver o preview
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-900 flex items-center justify-end gap-3 shrink-0">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                form="automation-form" 
                variant="primary"
                disabled={!formName.trim() || !formMessage.trim() || !formFallbackName.trim() || !formTriggerResource}
              >
                {editingId ? 'Salvar Alterações' : 'Criar Automação'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de Template */}
      {templateConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setTemplateConfirmation(null)} />
          <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Substituir mensagem atual pelo template?</h3>
            <p className="text-sm text-neutral-400 mb-6">
              A mensagem atual será substituída pelo conteúdo do template. Deseja continuar?
            </p>
            <div className="flex gap-3 justify-center">
              <Button type="button" variant="secondary" onClick={() => setTemplateConfirmation(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" onClick={confirmApplyTemplate}>
                Substituir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de Exclusão */}
      {deleteConfirmation && automationToDeleteObj && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setDeleteConfirmation(null); setDeleteError(null); }} />
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-2">
              <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="pt-1">
                <h3 className="text-xl font-bold text-white mb-2">Excluir Automação</h3>
                <p className="text-neutral-400 text-sm mb-6">
                  Tem certeza que deseja excluir a automação "{automationToDeleteObj.name}"? Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            
            {deleteError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-left flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4">
              <Button type="button" variant="secondary" onClick={() => { setDeleteConfirmation(null); setDeleteError(null); }}>
                Cancelar
              </Button>
              <Button type="button" variant="danger" onClick={handleDelete}>
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
