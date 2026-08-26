import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { FileText, Search, Plus, Edit2, Trash2, X, PlayCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { useTemplates } from '../hooks/useTemplates';
import type { MessageTemplate } from '../types';
import { renderMessageTemplate } from '../utils/template';

export function TemplatesView() {
  const { templates, loading, error, createTemplate, updateTemplate, deleteTemplate } = useTemplates();
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [fallbackName, setFallbackName] = useState('amigo(a)');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<MessageTemplate | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isModalOpen && !templateToDelete) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen, templateToDelete]);

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!searchTerm.trim()) return templates;
    const lower = searchTerm.toLowerCase();
    return templates.filter(t => 
      t.name.toLowerCase().includes(lower) || 
      t.message.toLowerCase().includes(lower)
    );
  }, [templates, searchTerm]);

  const openNewModal = () => {
    setEditingTemplate(null);
    setName('');
    setMessage('');
    setFallbackName('amigo(a)');
    setSaveError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (t: MessageTemplate) => {
    setEditingTemplate(t);
    setName(t.name);
    setMessage(t.message);
    setFallbackName(t.fallbackName);
    setSaveError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const insertVariable = (variable: string) => {
    setMessage(prev => {
      const textarea = document.getElementById('template-message-input') as HTMLTextAreaElement;
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

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    try {
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, { name, message, fallbackName });
      } else {
        await createTemplate({ name, message, fallbackName });
      }
      closeModal();
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!templateToDelete) return;
    setDeleteError(null);
    try {
      await deleteTemplate(templateToDelete.id);
      setTemplateToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao deletar');
    }
  };

  const generatedPreview = useMemo(() => {
    if (!message.trim()) return '';
    return renderMessageTemplate(
      message,
      {
        jid: 'preview',
        name: 'João Silva'
      },
      fallbackName || 'amigo(a)'
    );
  }, [message, fallbackName]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4 text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p>Carregando templates...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-3">
          <FileText className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
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
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Templates</h1>
              <p className="text-sm text-neutral-400 mt-1">Crie mensagens reutilizáveis para campanhas e agendamentos.</p>
            </div>
          </div>
          <Button variant="primary" onClick={openNewModal} className="shrink-0">
            <Plus className="w-5 h-5 mr-2" />
            Novo Template
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Total de Templates</p>
            <p className="text-2xl font-bold text-white mt-0.5">{templates?.length || 0}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* Empty State */}
      {!filteredTemplates.length ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-neutral-900/50 border border-neutral-800 border-dashed rounded-2xl">
          <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 mb-4 shadow-sm">
            <FileText className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Nenhum template encontrado</h3>
          <p className="text-neutral-400 mb-6 max-w-sm">
            Crie mensagens reutilizáveis para acelerar suas campanhas e agendamentos.
          </p>
          <Button variant="primary" onClick={openNewModal}>
            <Plus className="w-5 h-5 mr-2" />
            Criar primeiro template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(t => (
            <div key={t.id} className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-5 shadow-sm hover:border-neutral-700 transition-colors flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-white text-lg truncate pr-4">{t.name}</h3>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(t)}
                    className="p-1.5 text-neutral-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
                    aria-label="Editar"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTemplateToDelete(t); setDeleteError(null); }}
                    className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors"
                    aria-label="Excluir"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="text-sm text-neutral-300 line-clamp-3 mb-4 flex-1">
                {t.message}
              </div>
              <div className="flex items-center justify-between text-xs text-neutral-500 pt-4 border-t border-neutral-800">
                <span className="truncate">Fallback: {t.fallbackName}</span>
                <span className="shrink-0">{new Date(t.updatedAt).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Modal */}
      {templateToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setTemplateToDelete(null)} />
          <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20 mb-4 text-rose-400">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Excluir Template</h3>
            <p className="text-neutral-400 text-sm mb-6">
              Tem certeza que deseja excluir o template "{templateToDelete.name}"? Esta ação não pode ser desfeita.
            </p>
            {deleteError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setTemplateToDelete(null)}>Cancelar</Button>
              <Button type="button" variant="danger" onClick={handleDeleteConfirm}>Excluir</Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)] animate-in zoom-in-95 duration-200">
            
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {editingTemplate ? 'Editar Template' : 'Novo Template'}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors"
                aria-label="Fechar modal"
                title="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {saveError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                  {saveError}
                </div>
              )}

              <form id="template-form" onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">Nome do Template</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Boas-vindas, Cobrança, Promoção VIP"
                    className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider">Mensagem & Personalização</label>
                    <div className="flex items-center gap-2">
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
                  </div>
                  <textarea
                    id="template-message-input"
                    required
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Digite a mensagem do template..."
                    className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 min-h-[150px] resize-y transition-colors font-sans"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
                    Fallback para Nome <span className="text-neutral-500 font-normal normal-case">(se contato sem nome)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fallbackName}
                    onChange={e => setFallbackName(e.target.value)}
                    placeholder="Ex: amigo(a), cliente"
                    className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </form>

              <div className="pt-6 border-t border-neutral-800">
                <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-4">
                  <div className="text-[10px] uppercase text-neutral-500 font-medium mb-3 tracking-wider">Preview</div>
                  
                  {message ? (
                    <div className="relative inline-block bg-[#005c4b] text-[#e9edef] px-3 py-2 rounded-lg max-w-[85%] whitespace-pre-wrap text-sm shadow-sm">
                      {generatedPreview}
                      <span className="float-right ml-3 mt-2 text-[10px] text-[#8696a0]">12:00</span>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500 italic">Escreva uma mensagem para ver o preview</p>
                  )}
                </div>
              </div>

            </div>

            <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-900 flex items-center justify-end gap-3 shrink-0">
              <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" form="template-form" disabled={saving || !name.trim() || !message.trim() || !fallbackName.trim()}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />}
                {editingTemplate ? 'Salvar Alterações' : 'Criar Template'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
