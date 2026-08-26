import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { FileText, Search, Plus, Edit2, Trash2, X, PlayCircle, Loader2 } from 'lucide-react';
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Templates</h1>
            <p className="text-neutral-400 text-sm">
              Crie mensagens reutilizáveis para campanhas e agendamentos.
            </p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="bg-neutral-950/50 px-4 py-2 rounded-xl border border-neutral-800 flex items-center gap-3 w-full sm:w-auto">
            <span className="text-2xl font-bold text-white">{templates?.length || 0}</span>
            <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Total<br/>Templates</span>
          </div>
          <button
            onClick={openNewModal}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-xl transition-all shadow-sm shadow-emerald-500/20"
          >
            <Plus className="w-5 h-5" />
            <span>Novo Template</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-neutral-900 p-2 rounded-2xl border border-neutral-800">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
          />
        </div>
      </div>

      {!filteredTemplates.length ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-neutral-900/30 border border-neutral-800/50 border-dashed rounded-3xl">
          <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 mb-4 shadow-sm">
            <FileText className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Nenhum template encontrado</h3>
          <p className="text-neutral-400 mb-6 max-w-sm">
            Crie mensagens reutilizáveis para acelerar suas campanhas e agendamentos.
          </p>
          <button
            onClick={openNewModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-xl border border-neutral-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Criar primeiro template</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(t => (
            <div key={t.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-colors flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold text-white text-lg truncate pr-4">{t.name}</h3>
                <div className="flex items-center gap-1 shrink-0 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                  <button
                    onClick={() => openEditModal(t)}
                    className="p-1.5 text-neutral-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-md transition-colors"
                    aria-label="Editar"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setTemplateToDelete(t); setDeleteError(null); }}
                    className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-md transition-colors"
                    aria-label="Excluir"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 bg-neutral-950/50 rounded-xl p-3 border border-neutral-800/50 mb-4">
                <p className="text-sm text-neutral-300 line-clamp-3 whitespace-pre-wrap">{t.message}</p>
              </div>
              
              <div className="flex items-center justify-between text-xs text-neutral-500 font-medium">
                <span className="truncate">Fallback: {t.fallbackName}</span>
                <span className="shrink-0">{new Date(t.updatedAt).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {templateToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setTemplateToDelete(null)} />
          <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl p-6">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20 mb-4 text-rose-400">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Excluir Template</h3>
            <p className="text-neutral-400 text-sm mb-4">
              Tem certeza que deseja excluir o template "{templateToDelete.name}"? Esta ação não pode ser desfeita.
            </p>
            {deleteError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setTemplateToDelete(null)} className="flex-1 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-xl transition-colors">Cancelar</button>
              <button onClick={handleDeleteConfirm} className="flex-1 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white font-medium rounded-xl transition-colors shadow-sm shadow-rose-500/20">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50 shrink-0">
              <h2 className="text-xl font-bold text-white">
                {editingTemplate ? 'Editar Template' : 'Novo Template'}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors"
                aria-label="Fechar modal"
                title="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {saveError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                  {saveError}
                </div>
              )}

              <form id="template-form" onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">Nome do Template</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Boas-vindas, Cobrança, Promoção VIP"
                    className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-neutral-300">Mensagem & Personalização</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => insertVariable('{nome}')}
                        className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded border border-neutral-700 transition-colors font-mono"
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
                    className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 min-h-[150px] resize-y transition-all font-sans leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Fallback para Nome <span className="text-neutral-500 font-normal">(caso o contato não tenha nome)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fallbackName}
                    onChange={e => setFallbackName(e.target.value)}
                    placeholder="Ex: amigo(a), cliente"
                    className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                </div>
              </form>

              {message && (
                <div className="mt-6 pt-6 border-t border-neutral-800">
                  <div className="flex items-center gap-2 mb-4 text-emerald-400">
                    <PlayCircle className="w-5 h-5" />
                    <h3 className="font-semibold">Preview Gerado</h3>
                  </div>
                  <div className="bg-[#111b21] p-4 rounded-xl border border-neutral-800 relative shadow-inner">
                    <div className="relative z-10 bg-[#005c4b] text-[#e9edef] px-3 py-2 rounded-lg max-w-[85%] whitespace-pre-wrap text-sm shadow-sm inline-block">
                      {generatedPreview}
                      <span className="float-right ml-3 mt-2 text-[10px] text-[#8696a0]">12:00</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-900/50 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="px-5 py-2.5 text-neutral-400 hover:text-white font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="template-form"
                disabled={saving || !name.trim() || !message.trim() || !fallbackName.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-semibold rounded-xl transition-all shadow-sm"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{editingTemplate ? 'Salvar Alterações' : 'Criar Template'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
