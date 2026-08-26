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
  const { automations, loading, createAutomation, updateAutomation, deleteAutomation } = useAutomations(selectedInstanceId);
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

  useEffect(() => {
    setIsModalOpen(false);
    setEditingId(null);
    setDeleteConfirmation(null);
    setTemplateConfirmation(null);
  }, [selectedInstanceId]);

  // Scroll lock
  useEffect(() => {
    if (isModalOpen || deleteConfirmation || templateConfirmation) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formMessage.trim() || !formTriggerResource || !formFallbackName.trim()) {
      alert('Preencha todos os campos obrigatórios.');
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
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar automação');
    }
  };

  const toggleEnabled = async (a: Automation) => {
    try {
      await updateAutomation(a.id, { enabled: !a.enabled });
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar status');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmation) return;
    try {
      await deleteAutomation(deleteConfirmation);
      setDeleteConfirmation(null);
    } catch (err: any) {
      alert('Erro ao excluir automação');
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
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-500 p-6">
        Selecione uma instância para gerenciar automações.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="w-7 h-7 text-primary-500" />
              Automações
            </h1>
            <p className="text-gray-500 mt-1">
              Envie mensagens automaticamente quando seus contatos entrarem em listas ou receberem tags.
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Nova Automação
          </Button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="text-sm font-medium text-gray-500 mb-1">Total</div>
            <div className="text-2xl font-bold text-gray-900">{metrics.total}</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="text-sm font-medium text-gray-500 mb-1">Ativas</div>
            <div className="text-2xl font-bold text-green-600">{metrics.active}</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="text-sm font-medium text-gray-500 mb-1">Pausadas</div>
            <div className="text-2xl font-bold text-amber-600">{metrics.paused}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="relative max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar automações..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-shadow"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500">Carregando...</div>
          ) : filteredAutomations.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhuma automação</h3>
              <p className="text-gray-500 max-w-sm mx-auto">
                {search ? 'Nenhum resultado para sua busca.' : 'Você ainda não possui automações configuradas.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredAutomations.map(a => {
                const resourceName = getResourceName(a);
                return (
                  <div key={a.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                    <div className="p-5 border-b border-gray-100 flex items-start justify-between">
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 truncate">{a.name}</h3>
                          {a.enabled ? (
                            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              Ativa
                            </span>
                          ) : (
                            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              Pausada
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-2">
                          {a.trigger.type === 'contact_added_to_list' ? (
                            <Users className="w-3.5 h-3.5" />
                          ) : (
                            <Tag className="w-3.5 h-3.5" />
                          )}
                          <span className="truncate">
                            {a.trigger.type === 'contact_added_to_list' ? 'Adicionado à Lista: ' : 'Tag adicionada: '}
                            {resourceName ? (
                              <span className="font-medium text-gray-700">{resourceName}</span>
                            ) : (
                              <span className="text-red-500 flex items-center gap-1">
                                Gatilho indisponível <AlertTriangle className="w-3 h-3" />
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-5 bg-gray-50/50 flex-1">
                      <div className="text-sm text-gray-600 line-clamp-3 italic">
                        "{renderMessageTemplate(a.message, { type: 'person', jid: '', label: 'João', name: 'João', source: 'directory' }, a.fallbackName, { seed: 'preview' })}"
                      </div>
                    </div>
                    <div className="p-4 bg-white border-t border-gray-100 flex items-center justify-between">
                      <Button
                        variant={a.enabled ? "secondary" : "primary"}
                        onClick={() => toggleEnabled(a)}
                        className="text-xs py-1.5 px-3 h-auto"
                      >
                        {a.enabled ? <Pause className="w-3.5 h-3.5 mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                        {a.enabled ? 'Pausar' : 'Ativar'}
                      </Button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(a)}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmation(a.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary-500" />
                {editingId ? 'Editar Automação' : 'Nova Automação'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-gray-50/50">
              <form id="automation-form" onSubmit={handleSave} className="space-y-8">
                
                {/* 1. Nome e Status */}
                <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs">1</span>
                    Identificação
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nome da Automação *
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Ex: Boas-vindas novos leads"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status Inicial
                      </label>
                      <select
                        value={formEnabled ? 'true' : 'false'}
                        onChange={(e) => setFormEnabled(e.target.value === 'true')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                      >
                        <option value="true">Ativa</option>
                        <option value="false">Pausada</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* 2. Gatilho */}
                <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs">2</span>
                    Gatilho (Quando isso acontecer)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Evento *
                      </label>
                      <select
                        value={formTriggerType}
                        onChange={(e) => {
                          setFormTriggerType(e.target.value as any);
                          setFormTriggerResource('');
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                      >
                        <option value="contact_added_to_list">Contato adicionado a uma Lista</option>
                        <option value="tag_added_to_contact">Tag adicionada a um Contato</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {formTriggerType === 'contact_added_to_list' ? 'Qual Lista? *' : 'Qual Tag? *'}
                      </label>
                      <select
                        required
                        value={formTriggerResource}
                        onChange={(e) => setFormTriggerResource(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
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
                <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs">3</span>
                      Mensagem
                    </h3>
                    
                    {templates.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Usar template:</span>
                        <select
                          className="text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-primary-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      placeholder="Olá {nome}, tudo bem?"
                    />
                    <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-2">
                      <span>Dicas de formatação:</span>
                      <code className="bg-gray-100 px-1 py-0.5 rounded">*negrito*</code>
                      <code className="bg-gray-100 px-1 py-0.5 rounded">_itálico_</code>
                      <code className="bg-gray-100 px-1 py-0.5 rounded">~riscado~</code>
                      <code className="bg-gray-100 px-1 py-0.5 rounded">{'{nome}'}</code> para o nome
                      <code className="bg-gray-100 px-1 py-0.5 rounded">{'{Oi|Olá}'}</code> para Spintax
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome de fallback (se o contato não tiver nome) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formFallbackName}
                      onChange={(e) => setFormFallbackName(e.target.value)}
                      placeholder="amigo(a)"
                      className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                </section>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3 shrink-0">
              <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="automation-form">
                {editingId ? 'Salvar Alterações' : 'Criar Automação'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de Template */}
      {templateConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setTemplateConfirmation(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Substituir mensagem?</h3>
            <p className="text-sm text-gray-500 mb-6">
              A mensagem atual será substituída pelo conteúdo do template. Deseja continuar?
            </p>
            <div className="flex gap-3 justify-center">
              <Button type="button" variant="secondary" onClick={() => setTemplateConfirmation(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={confirmApplyTemplate}>
                Substituir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de Exclusão */}
      {deleteConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setDeleteConfirmation(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir automação?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Esta ação não pode ser desfeita. A automação será removida permanentemente.
            </p>
            <div className="flex gap-3 justify-center">
              <Button type="button" variant="secondary" onClick={() => setDeleteConfirmation(null)}>
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
