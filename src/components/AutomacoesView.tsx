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

  if (!selectedInstanceId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-950 text-neutral-500 p-6">
        Selecione uma instância para gerenciar automações.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-neutral-900 border-b border-neutral-800 px-8 py-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-100 flex items-center gap-2">
              <Zap className="w-7 h-7 text-emerald-500" />
              Automações
            </h1>
            <p className="text-neutral-400 mt-1">
              Envie mensagens automaticamente quando seus contatos entrarem em listas ou receberem tags.
            </p>
          </div>
          <Button onClick={openNew} variant="primary" className="gap-2">
            <Plus className="w-4 h-4" />
            Nova Automação
          </Button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-sm">
            <div className="text-sm font-medium text-neutral-400 mb-1">Total</div>
            <div className="text-2xl font-bold text-neutral-100">{metrics.total}</div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-sm">
            <div className="text-sm font-medium text-neutral-400 mb-1">Ativas</div>
            <div className="text-2xl font-bold text-emerald-500">{metrics.active}</div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-sm">
            <div className="text-sm font-medium text-neutral-400 mb-1">Pausadas</div>
            <div className="text-2xl font-bold text-amber-500">{metrics.paused}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {(actionError || error) && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl p-4 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {actionError || error}
            </div>
          )}

          <div className="relative max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Buscar automações..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-shadow"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-neutral-500">Carregando...</div>
          ) : filteredAutomations.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-neutral-800">
                <Zap className="w-8 h-8 text-neutral-600" />
              </div>
              <h3 className="text-lg font-medium text-neutral-200 mb-1">Nenhuma automação criada</h3>
              <p className="text-neutral-400 max-w-sm mx-auto mb-6">
                {search ? 'Nenhum resultado para sua busca.' : 'Crie uma automação para enviar mensagens quando seus contatos entrarem em listas ou receberem tags.'}
              </p>
              {!search && (
                <Button onClick={openNew} variant="primary">
                  Criar primeira automação
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredAutomations.map(a => {
                const resourceName = getResourceName(a);
                return (
                  <div key={a.id} className="bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 rounded-2xl overflow-hidden shadow transition flex flex-col">
                    <div className="p-5 border-b border-neutral-800 flex items-start justify-between">
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-neutral-100 truncate">{a.name}</h3>
                          {a.enabled ? (
                            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                              Ativa
                            </span>
                          ) : (
                            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                              Pausada
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-400 flex items-center gap-1.5 mt-2">
                          {a.trigger.type === 'contact_added_to_list' ? (
                            <Users className="w-3.5 h-3.5" />
                          ) : (
                            <Tag className="w-3.5 h-3.5" />
                          )}
                          <span className="truncate">
                            {a.trigger.type === 'contact_added_to_list' ? 'Adicionado à Lista: ' : 'Tag adicionada: '}
                            {resourceName ? (
                              <span className="font-medium text-neutral-300">{resourceName}</span>
                            ) : (
                              <span className="text-amber-400 flex items-center gap-1">
                                Gatilho indisponível <AlertTriangle className="w-3 h-3" />
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-5 bg-neutral-950/40 flex-1">
                      <div className="text-sm text-neutral-400 line-clamp-3 italic">
                        "{renderMessageTemplate(a.message, { type: 'person', jid: '', label: 'João', name: 'João', source: 'directory' }, a.fallbackName, { seed: 'preview' })}"
                      </div>
                    </div>
                    <div className="p-4 bg-neutral-900/90 border-t border-neutral-800 flex items-center justify-between">
                      <Button
                        type="button"
                        variant={a.enabled ? "secondary" : "primary"}
                        onClick={() => toggleEnabled(a)}
                        className="text-xs py-1.5 px-3 h-auto"
                      >
                        {a.enabled ? <Pause className="w-3.5 h-3.5 mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                        {a.enabled ? 'Pausar' : 'Ativar'}
                      </Button>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(a)}
                          className="p-1.5 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 rounded-lg transition-colors"
                          title="Editar"
                          aria-label="Editar automação"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(a.id)}
                          className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 rounded-lg transition-colors"
                          title="Excluir"
                          aria-label="Excluir automação"
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
        </div>
      </div>

      {/* Modal Nova/Editar Automação */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 p-4 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900 shrink-0">
              <h2 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-500" />
                {editingId ? 'Editar Automação' : 'Nova Automação'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-full transition-colors"
                title="Fechar modal"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-neutral-950/50">
              <form id="automation-form" onSubmit={handleSave} className="space-y-6">
                
                {formError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {formError}
                  </div>
                )}

                {/* 1. Nome e Status */}
                <section className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 shadow-sm space-y-4">
                  <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[10px] border border-emerald-500/20">1</span>
                    Identificação
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-neutral-300 mb-1">
                        Nome da Automação *
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Ex: Boas-vindas novos leads"
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-300 mb-1">
                        Status Inicial
                      </label>
                      <select
                        value={formEnabled ? 'true' : 'false'}
                        onChange={(e) => setFormEnabled(e.target.value === 'true')}
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      >
                        <option value="true">Ativa</option>
                        <option value="false">Pausada</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* 2. Gatilho */}
                <section className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 shadow-sm space-y-4">
                  <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[10px] border border-emerald-500/20">2</span>
                    Gatilho (Quando isso acontecer)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-300 mb-1">
                        Evento *
                      </label>
                      <select
                        value={formTriggerType}
                        onChange={(e) => {
                          setFormTriggerType(e.target.value as any);
                          setFormTriggerResource('');
                        }}
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      >
                        <option value="contact_added_to_list">Contato adicionado a uma Lista</option>
                        <option value="tag_added_to_contact">Tag adicionada a um Contato</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-300 mb-1">
                        {formTriggerType === 'contact_added_to_list' ? 'Qual Lista? *' : 'Qual Tag? *'}
                      </label>
                      <select
                        required
                        value={formTriggerResource}
                        onChange={(e) => setFormTriggerResource(e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
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
                </section>

                {/* 3. Mensagem */}
                <section className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[10px] border border-emerald-500/20">3</span>
                      Mensagem
                    </h3>
                    
                    {templates.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500">Usar template:</span>
                        <select
                          className="text-sm px-2 py-1 bg-neutral-950 border border-neutral-800 rounded-lg focus:outline-none focus:border-emerald-500 text-neutral-300"
                          onChange={(e) => {
                            if (e.target.value) applyTemplate(e.target.value);
                            e.target.value = '';
                          }}
                          value=""
                        >
                          <option value="" disabled>Selecione...</option>
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <textarea
                      required
                      value={formMessage}
                      onChange={(e) => setFormMessage(e.target.value)}
                      rows={5}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="Olá {nome}, tudo bem?"
                    />
                    <div className="mt-2 text-xs text-neutral-500 flex flex-wrap gap-x-4 gap-y-2">
                      <span>Dicas de formatação:</span>
                      <code className="bg-neutral-800 text-neutral-300 px-1 py-0.5 rounded">*negrito*</code>
                      <code className="bg-neutral-800 text-neutral-300 px-1 py-0.5 rounded">_itálico_</code>
                      <code className="bg-neutral-800 text-neutral-300 px-1 py-0.5 rounded">~riscado~</code>
                      <code className="bg-neutral-800 text-neutral-300 px-1 py-0.5 rounded">{'{nome}'}</code> para o nome
                      <code className="bg-neutral-800 text-neutral-300 px-1 py-0.5 rounded">{'{Oi|Olá}'}</code> para Spintax
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-800">
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Nome de fallback (se o contato não tiver nome) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formFallbackName}
                      onChange={(e) => setFormFallbackName(e.target.value)}
                      placeholder="amigo(a)"
                      className="w-full md:w-1/2 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  {/* Preview Section */}
                  <div className="mt-6 pt-6 border-t border-neutral-800">
                    <label className="block text-sm font-medium text-neutral-300 mb-3">
                      Preview
                    </label>
                    <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4">
                      {formMessage.trim() ? (
                         <div className="bg-neutral-900 rounded-2xl rounded-tl-sm p-3 shadow-sm inline-block max-w-[85%] text-sm text-neutral-200">
                           <div className="whitespace-pre-wrap">
                             {renderMessageTemplate(formMessage, { type: 'person', jid: '5511999999999@s.whatsapp.net', label: 'João Silva', name: 'João Silva', source: 'directory' }, formFallbackName, { seed: 'automation-preview' })}
                           </div>
                         </div>
                      ) : (
                         <div className="text-neutral-500 italic text-sm">
                           Escreva uma mensagem para ver o preview
                         </div>
                      )}
                    </div>
                  </div>
                </section>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-900 flex items-center justify-end gap-3 shrink-0">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancelar
              </Button>
              <Button type="submit" form="automation-form" variant="primary">
                {editingId ? 'Salvar Alterações' : 'Criar Automação'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de Template */}
      {templateConfirmation && (
        <div className="fixed inset-0 z-[60] p-4 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-neutral-100 mb-2">Substituir mensagem?</h3>
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
      {deleteConfirmation && (
        <div className="fixed inset-0 z-[60] p-4 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-neutral-100 mb-2">Excluir automação?</h3>
            <p className="text-sm text-neutral-400 mb-6">
              Esta ação não pode ser desfeita. A automação será removida permanentemente.
            </p>
            
            {deleteError && (
              <div className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-sm text-left flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex gap-3 justify-center">
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
