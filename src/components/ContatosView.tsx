import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, RefreshCw, Search, Loader2, UserCircle2, 
  MessageSquare, UserPlus, MessageCircle, Tag, List, Trash2, Plus, Edit2, X, CheckSquare, Square, Check
} from 'lucide-react';
import { useContacts } from '../hooks/useContacts';
import { useInstances } from '../contexts/InstancesContext';
import { useAudiences } from '../hooks/useAudiences';
import { Button } from './ui/Button';
import type { KnownContact } from '../types';

function formatBrazilianNumber(number: string | null): string {
  if (!number) return '';
  const digits = number.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    const ddd = digits.substring(2, 4);
    const firstPart = digits.substring(4, digits.length - 4);
    const secondPart = digits.substring(digits.length - 4);
    return `+55 (${ddd}) ${firstPart}-${secondPart}`;
  }
  return `+${digits}`;
}

function getInitial(name: string | null): string {
  if (!name) return '?';
  const clean = name.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '');
  return clean.charAt(0).toUpperCase() || '?';
}

function getDisplayName(contact: KnownContact): string {
  if (contact.name && contact.name.trim()) return contact.name;
  return 'Contato sem nome';
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'message': return 'Mensagens';
    case 'contact': return 'Contatos';
    case 'chat': return 'Conversas';
    default: return source;
  }
}

function formatLastSeen(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch (e) {
    return 'Data inválida';
  }
}

export function ContatosView() {
  const { selectedInstanceId } = useInstances();
  const { contacts, loading: contactsLoading, error: contactsError, fetchContacts } = useContacts(selectedInstanceId);
  const { 
    state: audiences, loading: audiencesLoading, error: audiencesError, fetchAudiences, 
    createTag, renameTag, deleteTag, addTagToContacts, removeTagFromContacts, 
    createList, renameList, deleteList, updateListContacts
  } = useAudiences(selectedInstanceId);

  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [selectedList, setSelectedList] = useState<string>('');

  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());

  const [tagInput, setTagInput] = useState('');
  const [listInput, setListInput] = useState('');

  // Inline editing states
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');

  // Confirmation states
  const [confirmDeleteTagId, setConfirmDeleteTagId] = useState<string | null>(null);
  const [confirmDeleteListId, setConfirmDeleteListId] = useState<string | null>(null);

  const [audienceActionError, setAudienceActionError] = useState<string | null>(null);

  // Clear selections on instance change
  useEffect(() => {
    setSelectedJids(new Set());
    setAudienceActionError(null);
  }, [selectedInstanceId]);

  const metrics = useMemo(() => {
    let withName = 0; let withoutName = 0; let recentActive = 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    contacts.forEach(c => {
      if (c.name?.trim()) withName++; else withoutName++;
      if (c.lastSeenAt) {
        const d = new Date(c.lastSeenAt);
        if (!isNaN(d.getTime()) && d >= sevenDaysAgo) recentActive++;
      }
    });
    return { total: contacts.length, withName, withoutName, recentActive };
  }, [contacts]);

  const sources = useMemo(() => Array.from(new Set(contacts.map(c => c.source))), [contacts]);

  const filteredContacts = useMemo(() => {
    let filtered = contacts;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(c => c.name?.toLowerCase().includes(q) || c.number?.includes(q));
    }
    if (selectedSource) {
      filtered = filtered.filter(c => c.source === selectedSource);
    }
    if (selectedTag && audiences) {
      filtered = filtered.filter(c => audiences.contactTags[c.jid]?.includes(selectedTag));
    }
    if (selectedList && audiences) {
      const list = audiences.lists.find(l => l.id === selectedList);
      if (list) {
        const set = new Set(list.contactJids);
        filtered = filtered.filter(c => set.has(c.jid));
      }
    }
    return filtered.sort((a, b) => {
      const dA = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const dB = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return dB - dA;
    });
  }, [contacts, search, selectedSource, selectedTag, selectedList, audiences]);

  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage) || 1;
  const paginatedContacts = filteredContacts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const toggleSelect = (jid: string) => {
    const next = new Set(selectedJids);
    if (next.has(jid)) next.delete(jid);
    else next.add(jid);
    setSelectedJids(next);
  };
  const toggleSelectAll = () => {
    if (selectedJids.size === paginatedContacts.length && paginatedContacts.length > 0) {
      setSelectedJids(new Set());
    } else {
      const next = new Set(selectedJids);
      paginatedContacts.forEach(c => next.add(c.jid));
      setSelectedJids(next);
    }
  };

  const handleError = (e: any) => {
    setAudienceActionError(e.message || 'Erro na operação de audiência');
    setTimeout(() => setAudienceActionError(null), 5000);
  };

  const handleCreateTag = async () => {
    if (!tagInput.trim()) return;
    try { await createTag(tagInput); setTagInput(''); }
    catch (e: any) { handleError(e); }
  };
  
  const handleRenameTag = async (tagId: string) => {
    if (!editingTagName.trim()) {
      setEditingTagId(null);
      return;
    }
    try { await renameTag(tagId, editingTagName); setEditingTagId(null); }
    catch (e: any) { handleError(e); }
  };

  const handleDeleteTag = async (tagId: string) => {
    try { await deleteTag(tagId); setConfirmDeleteTagId(null); }
    catch (e: any) { handleError(e); }
  };

  const handleCreateList = async () => {
    if (!listInput.trim()) return;
    try { await createList(listInput, Array.from(selectedJids)); setListInput(''); setSelectedJids(new Set()); }
    catch (e: any) { handleError(e); }
  };

  const handleRenameList = async (listId: string) => {
    if (!editingListName.trim()) {
      setEditingListId(null);
      return;
    }
    try { await renameList(listId, editingListName); setEditingListId(null); }
    catch (e: any) { handleError(e); }
  };

  const handleDeleteList = async (listId: string) => {
    try { await deleteList(listId); setConfirmDeleteListId(null); }
    catch (e: any) { handleError(e); }
  };

  const handleApplyTag = async (tagId: string) => {
    try { await addTagToContacts(tagId, Array.from(selectedJids)); setSelectedJids(new Set()); }
    catch (e: any) { handleError(e); }
  };
  const handleRemoveTag = async (tagId: string) => {
    try { await removeTagFromContacts(tagId, Array.from(selectedJids)); setSelectedJids(new Set()); }
    catch (e: any) { handleError(e); }
  };

  const handleApplyToList = async (listId: string) => {
    try {
      const list = audiences?.lists.find(l => l.id === listId);
      if (!list) return;
      const merged = Array.from(
        new Set([
          ...list.contactJids,
          ...Array.from(selectedJids)
        ])
      );
      await updateListContacts(listId, merged);
      setSelectedJids(new Set());
    } catch (e: any) {
      handleError(e);
    }
  };

  const handleRemoveFromList = async (listId: string) => {
    try {
      const list = audiences?.lists.find(l => l.id === listId);
      if (!list) return;
      const jidsToRemove = Array.from(selectedJids);
      const remaining = list.contactJids.filter(jid => !jidsToRemove.includes(jid));
      await updateListContacts(listId, remaining);
      setSelectedJids(new Set());
    } catch (e: any) {
      handleError(e);
    }
  };

  const loading = contactsLoading || audiencesLoading;
  const error = contactsError || audiencesError;

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4 animate-in fade-in duration-500">
        <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4 shadow-xl">
          <Users className="w-8 h-8 text-neutral-500" />
        </div>
        <h2 className="text-xl font-semibold text-white tracking-tight">Nenhuma Instância Selecionada</h2>
        <p className="text-sm text-neutral-400 mt-2 max-w-sm">Selecione uma instância do WhatsApp no menu lateral para visualizar os contatos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Contatos & Audiências</h1>
              <p className="text-sm text-neutral-400 mt-1">Diretório de contatos reconhecidos e organizados em tags e listas.</p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => { fetchContacts(); fetchAudiences(); }} disabled={loading} className="shrink-0">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {(error || audienceActionError) && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-sm text-rose-400 font-medium">
            {error || audienceActionError}
          </p>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Total de Contatos</p>
            <p className="text-2xl font-bold text-white mt-0.5">{metrics.total}</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
            <UserCircle2 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Com Nome</p>
            <p className="text-2xl font-bold text-white mt-0.5">{metrics.withName}</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Sem Nome</p>
            <p className="text-2xl font-bold text-white mt-0.5">{metrics.withoutName}</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Ativos (7 dias)</p>
            <p className="text-2xl font-bold text-white mt-0.5">{metrics.recentActive}</p>
          </div>
        </div>
      </div>

      {selectedJids.size > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between sticky top-4 z-10 shadow-xl backdrop-blur-md animate-in slide-in-from-top-4">
          <span className="text-sm font-medium text-emerald-400">{selectedJids.size} contatos selecionados</span>
          <div className="flex gap-2">
            <Button variant="secondary" className="h-8 text-xs px-3 bg-neutral-900 hover:text-white" onClick={() => setSelectedJids(new Set())}>Cancelar</Button>
            
            <div className="relative group">
              <Button variant="primary-soft" className="h-8 text-xs px-3 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 hover:border-emerald-500/50">
                <Tag className="w-3.5 h-3.5 mr-1.5" /> Tag (+/-)
              </Button>
              <div className="absolute right-0 mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
                  {audiences?.tags.map(t => (
                    <div key={t.id} className="flex gap-1">
                      <button onClick={() => handleApplyTag(t.id)} className="flex-1 text-left px-2 py-1.5 text-xs text-emerald-400 hover:bg-neutral-800 rounded-lg truncate">
                        + {t.name}
                      </button>
                      <button onClick={() => handleRemoveTag(t.id)} className="px-2 py-1.5 text-xs text-rose-400 hover:bg-neutral-800 rounded-lg shrink-0">
                        -
                      </button>
                    </div>
                  ))}
                  {audiences?.tags.length === 0 && <div className="text-xs text-neutral-500 p-2 text-center">Crie tags primeiro</div>}
                </div>
              </div>
            </div>
            
            <div className="relative group">
              <Button variant="primary-soft" className="h-8 text-xs px-3 bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30 hover:border-amber-500/50">
                <List className="w-3.5 h-3.5 mr-1.5" /> Adicionar à lista
              </Button>
              <div className="absolute right-0 mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
                  {audiences?.lists.map(l => (
                    <button key={l.id} onClick={() => handleApplyToList(l.id)} className="w-full text-left px-2 py-1.5 text-xs text-amber-400 hover:bg-neutral-800 rounded-lg truncate">
                      + {l.name}
                    </button>
                  ))}
                  {audiences?.lists.length === 0 && <div className="text-xs text-neutral-500 p-2 text-center">Nenhuma lista criada</div>}
                </div>
              </div>
            </div>
            
            <Button variant="secondary" className="h-8 text-xs px-3 border-amber-500/30 text-amber-400 hover:bg-amber-500/10" onClick={handleCreateList}>
              <List className="w-3.5 h-3.5 mr-1.5" /> Criar Lista Desta Seleção
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input type="text" placeholder="Buscar por nome ou número..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-neutral-600" />
            </div>
            <select value={selectedSource} onChange={e => { setSelectedSource(e.target.value); setCurrentPage(1); }} className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-300 focus:outline-none focus:border-emerald-500 appearance-none min-w-[140px]">
              <option value="">Todas Origens</option>
              {sources.map(s => <option key={s} value={s}>{getSourceLabel(s)}</option>)}
            </select>
            <select value={selectedTag} onChange={e => { setSelectedTag(e.target.value); setCurrentPage(1); }} className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-300 focus:outline-none focus:border-emerald-500 appearance-none min-w-[120px]">
              <option value="">Todas Tags</option>
              {audiences?.tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={selectedList} onChange={e => { setSelectedList(e.target.value); setCurrentPage(1); }} className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-300 focus:outline-none focus:border-emerald-500 appearance-none min-w-[120px]">
              <option value="">Todas Listas</option>
              {audiences?.lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl flex flex-col min-h-[400px]">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800/80 bg-neutral-950/30">
                    <th className="px-4 py-3 text-center w-12 font-medium text-neutral-400 text-xs uppercase tracking-wider">
                      <button onClick={toggleSelectAll} className="hover:text-white focus:outline-none">
                        {selectedJids.size > 0 && selectedJids.size === paginatedContacts.length ? <CheckSquare className="w-4 h-4 text-emerald-500" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="px-2 py-3 font-medium text-neutral-400 text-xs uppercase tracking-wider">Contato</th>
                    <th className="px-5 py-3 font-medium text-neutral-400 text-xs uppercase tracking-wider">Tags</th>
                    <th className="px-5 py-3 font-medium text-neutral-400 text-xs uppercase tracking-wider text-right">Visto por último</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {paginatedContacts.map((c, i) => {
                    const isSel = selectedJids.has(c.jid);
                    const tagsForJid = audiences?.contactTags[c.jid] || [];
                    const tagObjs = (audiences?.tags || []).filter(t => tagsForJid.includes(t.id));

                    return (
                      <tr key={c.jid || i} className={`hover:bg-neutral-800/20 transition-colors group ${isSel ? 'bg-emerald-500/5' : ''}`}>
                        <td className="px-4 py-3 text-center align-middle">
                          <button onClick={() => toggleSelect(c.jid)} className="text-neutral-500 hover:text-white focus:outline-none">
                            {isSel ? <CheckSquare className="w-4 h-4 text-emerald-500" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-2 py-3 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-300 shrink-0">
                              {getInitial(c.name)}
                            </div>
                            <div className="flex flex-col min-w-0" title={c.jid}>
                              <span className={`text-sm font-semibold truncate ${c.name ? 'text-white' : 'text-neutral-400'}`}>
                                {getDisplayName(c)}
                              </span>
                              <span className="text-xs font-mono text-neutral-500">{formatBrazilianNumber(c.number)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 align-middle">
                          <div className="flex flex-wrap gap-1">
                            {tagObjs.map(t => (
                              <span key={t.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {t.name}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3 align-middle text-right">
                          <span className="text-xs text-neutral-400 whitespace-nowrap">{formatLastSeen(c.lastSeenAt)}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedContacts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-neutral-500 text-sm">Nenhum contato encontrado na página.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {totalPages > 1 && (
              <div className="border-t border-neutral-800/80 p-4 flex items-center justify-between sm:justify-center gap-4 bg-neutral-950/30">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white disabled:opacity-50 transition-colors">
                  Anterior
                </button>
                <div className="hidden sm:flex items-center gap-1">
                  {getPageNumbers().map((pageNum, idx) => (
                    pageNum === '...' ? (
                      <span key={`dots-${idx}`} className="w-8 text-center text-neutral-600 text-sm">...</span>
                    ) : (
                      <button key={`page-${pageNum}`} onClick={() => setCurrentPage(pageNum as number)} className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${currentPage === pageNum ? 'bg-emerald-500 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}>
                        {pageNum}
                      </button>
                    )
                  ))}
                </div>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white disabled:opacity-50 transition-colors">
                  Próxima
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Sidebar Audiences */}
        <div className="space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-md space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 uppercase tracking-wider">
              <Tag className="w-4 h-4 text-emerald-400" /> Tags
            </h2>
            <div className="flex gap-2">
              <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Nova Tag..." className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
              <Button variant="primary-soft" className="px-3 py-1.5 h-auto text-xs" onClick={handleCreateTag}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {audiences?.tags.map(t => {
                let count = 0;
                for (const jid in audiences.contactTags) { if (audiences.contactTags[jid].includes(t.id)) count++; }
                
                const isEditing = editingTagId === t.id;
                const isConfirmDelete = confirmDeleteTagId === t.id;

                return (
                  <div key={t.id} className="flex flex-col gap-1 p-2 rounded-lg border border-neutral-800/50 bg-neutral-950/30">
                    <div className="flex items-center justify-between gap-2">
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={editingTagName} 
                          onChange={(e) => setEditingTagName(e.target.value)} 
                          className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:border-emerald-500 min-w-0"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameTag(t.id); else if (e.key === 'Escape') setEditingTagId(null); }}
                        />
                      ) : (
                        <span className="text-sm font-medium text-neutral-200 truncate">{t.name}</span>
                      )}
                      
                      <div className="flex items-center gap-1 shrink-0">
                        {isConfirmDelete ? (
                          <>
                            <button onClick={() => handleDeleteTag(t.id)} className="p-1 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30" title="Confirmar"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setConfirmDeleteTagId(null)} className="p-1 rounded bg-neutral-800 text-neutral-400 hover:text-white" title="Cancelar"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : isEditing ? (
                          <>
                            <button onClick={() => handleRenameTag(t.id)} className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingTagId(null)} className="p-1 rounded bg-neutral-800 text-neutral-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingTagId(t.id); setEditingTagName(t.name); }} className="p-1 rounded text-neutral-500 hover:text-emerald-400 hover:bg-neutral-800"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={() => setConfirmDeleteTagId(t.id)} className="p-1 rounded text-neutral-500 hover:text-rose-400 hover:bg-neutral-800"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-neutral-500">{count} contatos</div>
                  </div>
                );
              })}
              {audiences?.tags.length === 0 && <div className="text-xs text-neutral-500 text-center py-2">Nenhuma tag</div>}
            </div>
          </div>
          
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-md space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 uppercase tracking-wider">
              <List className="w-4 h-4 text-amber-400" /> Listas
            </h2>
            <div className="flex gap-2">
              <input type="text" value={listInput} onChange={e => setListInput(e.target.value)} placeholder="Nova Lista..." className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500" />
              <Button variant="secondary" className="px-3 py-1.5 h-auto text-xs hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30" onClick={handleCreateList}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {audiences?.lists.map(l => {
                const isEditing = editingListId === l.id;
                const isConfirmDelete = confirmDeleteListId === l.id;
                return (
                  <div key={l.id} className="flex flex-col gap-1 p-2 rounded-lg border border-neutral-800/50 bg-neutral-950/30">
                    <div className="flex items-center justify-between gap-2">
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={editingListName} 
                          onChange={(e) => setEditingListName(e.target.value)} 
                          className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:border-amber-500 min-w-0"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameList(l.id); else if (e.key === 'Escape') setEditingListId(null); }}
                        />
                      ) : (
                        <span className="text-sm font-medium text-neutral-200 truncate">{l.name}</span>
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        {isConfirmDelete ? (
                          <>
                            <button onClick={() => handleDeleteList(l.id)} className="p-1 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30" title="Confirmar"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setConfirmDeleteListId(null)} className="p-1 rounded bg-neutral-800 text-neutral-400 hover:text-white" title="Cancelar"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : isEditing ? (
                          <>
                            <button onClick={() => handleRenameList(l.id)} className="p-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingListId(null)} className="p-1 rounded bg-neutral-800 text-neutral-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingListId(l.id); setEditingListName(l.name); }} className="p-1 rounded text-neutral-500 hover:text-amber-400 hover:bg-neutral-800"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={() => setConfirmDeleteListId(l.id)} className="p-1 rounded text-neutral-500 hover:text-rose-400 hover:bg-neutral-800"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-neutral-500">{l.contactJids.length} contatos</div>
                  </div>
                );
              })}
              {audiences?.lists.length === 0 && <div className="text-xs text-neutral-500 text-center py-2">Nenhuma lista</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
