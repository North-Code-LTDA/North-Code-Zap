import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, RefreshCw, Search, Loader2, UserCircle2, 
  MessageSquare, UserPlus, MessageCircle, Tag, List, Trash2, Plus, Edit2, X, CheckSquare, Square
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
  const n = name;
  if (!n) return '?';
  const clean = n.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '');
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

function getSourceIcon(source: string) {
  switch (source) {
    case 'message': return <MessageSquare className="w-3 h-3" />;
    case 'contact': return <UserPlus className="w-3 h-3" />;
    case 'chat': return <MessageCircle className="w-3 h-3" />;
    default: return <Users className="w-3 h-3" />;
  }
}

function formatLastSeen(dateString?: string | null): string {
  if (!dateString) return 'Sem registro';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Sem registro';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (targetDate.getTime() === today.getTime()) return `Hoje, ${timeStr}`;
  else if (targetDate.getTime() === yesterday.getTime()) return `Ontem, ${timeStr}`;
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${timeStr}`;
}

export function ContatosView() {
  const { selectedInstanceId } = useInstances();
  const { contacts, loading, error, fetchContacts } = useContacts(selectedInstanceId);
  const { state: audiences, fetchAudiences, createTag, deleteTag, renameTag, addTagToContacts, removeTagFromContacts, createList, renameList, deleteList, updateListContacts } = useAudiences(selectedInstanceId);
  
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [listFilter, setListFilter] = useState<string>('all');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  
  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());

  const [tagInput, setTagInput] = useState('');
  const [listInput, setListInput] = useState('');

  // Clear selections on instance change
  useEffect(() => {
    setSelectedJids(new Set());
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

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      if (sourceFilter !== 'all' && c.source !== sourceFilter) return false;
      if (tagFilter !== 'all') {
        const cTags = audiences?.contactTags[c.jid] || [];
        if (!cTags.includes(tagFilter)) return false;
      }
      if (listFilter !== 'all') {
        const lst = audiences?.lists.find(l => l.id === listFilter);
        if (!lst || !lst.contactJids.includes(c.jid)) return false;
      }
      if (search.trim()) {
        const term = search.toLowerCase();
        if (!(c.name || '').toLowerCase().includes(term) && !(c.number || '').toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [contacts, search, sourceFilter, tagFilter, listFilter, audiences]);

  useEffect(() => { setCurrentPage(1); }, [search, sourceFilter, tagFilter, listFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const paginatedContacts = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredContacts.slice(startIndex, startIndex + pageSize);
  }, [filteredContacts, currentPage, pageSize]);

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...'); pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1); pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1); pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...'); pages.push(totalPages);
      }
    }
    return pages;
  };

  const handleSelectPage = () => {
    const newSelected = new Set(selectedJids);
    const pageJids = paginatedContacts.map(c => c.jid);
    const allSelected = pageJids.every(jid => newSelected.has(jid));
    if (allSelected) {
      pageJids.forEach(jid => newSelected.delete(jid));
    } else {
      pageJids.forEach(jid => newSelected.add(jid));
    }
    setSelectedJids(newSelected);
  };

  const toggleSelect = (jid: string) => {
    const newSelected = new Set(selectedJids);
    if (newSelected.has(jid)) newSelected.delete(jid);
    else newSelected.add(jid);
    setSelectedJids(newSelected);
  };

  const isPageAllSelected = paginatedContacts.length > 0 && paginatedContacts.every(c => selectedJids.has(c.jid));
  const isPageSomeSelected = paginatedContacts.length > 0 && paginatedContacts.some(c => selectedJids.has(c.jid)) && !isPageAllSelected;

  const handleCreateTag = async () => {
    if (!tagInput.trim()) return;
    try { await createTag(tagInput); setTagInput(''); }
    catch (e: any) { alert(e.message); }
  };

  const handleCreateList = async () => {
    if (!listInput.trim()) return;
    try { await createList(listInput, Array.from(selectedJids)); setListInput(''); setSelectedJids(new Set()); }
    catch (e: any) { alert(e.message); }
  };

  if (loading && contacts.length === 0) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-md space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou número..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <select 
                value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300 px-3 py-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Todas Origens</option>
                <option value="message">Mensagens</option>
                <option value="contact">Contatos</option>
                <option value="chat">Conversas</option>
              </select>

              <select 
                value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300 px-3 py-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Todas Tags</option>
                {audiences?.tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>

              <select 
                value={listFilter} onChange={(e) => setListFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300 px-3 py-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Todas Listas</option>
                {audiences?.lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>

          {selectedJids.size > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-sm font-medium text-emerald-400">{selectedJids.size} contatos selecionados</span>
              <div className="flex flex-wrap items-center gap-2">
                <select id="tagAction" className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300 px-2 py-1.5 focus:outline-none focus:border-emerald-500">
                  <option value="">Ação com Tag...</option>
                  {audiences?.tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <Button variant="secondary" className="px-3 py-1.5 h-auto text-xs" onClick={async () => {
                  const sel = document.getElementById('tagAction') as HTMLSelectElement;
                  if (sel.value) {
                    await addTagToContacts(sel.value, Array.from(selectedJids));
                    sel.value = '';
                  }
                }}>Add Tag</Button>
                <Button variant="secondary" className="px-3 py-1.5 h-auto text-xs" onClick={async () => {
                  const sel = document.getElementById('tagAction') as HTMLSelectElement;
                  if (sel.value) {
                    await removeTagFromContacts(sel.value, Array.from(selectedJids));
                    sel.value = '';
                  }
                }}>Remover Tag</Button>
                
                <select id="listAction" className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300 px-2 py-1.5 focus:outline-none focus:border-emerald-500">
                  <option value="">Adicionar à lista...</option>
                  {audiences?.lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <Button variant="secondary" className="px-3 py-1.5 h-auto text-xs" onClick={async () => {
                  const sel = document.getElementById('listAction') as HTMLSelectElement;
                  if (sel.value) {
                    const lst = audiences?.lists.find(l => l.id === sel.value);
                    if (lst) {
                      await updateListContacts(sel.value, [...lst.contactJids, ...Array.from(selectedJids)]);
                    }
                    sel.value = '';
                  }
                }}>Adicionar</Button>
                
                <Button variant="ghost" className="px-3 py-1.5 h-auto text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10" onClick={() => setSelectedJids(new Set())}>
                  Limpar
                </Button>
              </div>
            </div>
          )}

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-950/50">
                    <th className="px-4 py-3 w-10 text-center">
                      <button onClick={handleSelectPage} className="text-neutral-500 hover:text-white focus:outline-none">
                        {isPageAllSelected ? <CheckSquare className="w-4 h-4 text-emerald-500" /> : isPageSomeSelected ? <CheckSquare className="w-4 h-4 text-emerald-500/50" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="px-2 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Contato</th>
                    <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Tags</th>
                    <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider text-right">Última Atividade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/80">
                  {paginatedContacts.map((c, i) => {
                    const cTags = audiences?.contactTags[c.jid] || [];
                    const tagObjs = cTags.map(tid => audiences?.tags.find(t => t.id === tid)).filter(Boolean) as typeof audiences.tags;
                    const isSel = selectedJids.has(c.jid);
                    
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
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white disabled:opacity-50 transition-colors"
                >
                  Anterior
                </button>
                <div className="hidden sm:flex items-center gap-1">
                  {getPageNumbers().map((pageNum, idx) => (
                    pageNum === '...' ? (
                      <span key={`dots-${idx}`} className="w-8 text-center text-neutral-600 text-sm">...</span>
                    ) : (
                      <button
                        key={`page-${pageNum}`}
                        onClick={() => setCurrentPage(pageNum as number)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === pageNum
                            ? 'bg-emerald-500 text-white'
                            : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white disabled:opacity-50 transition-colors"
                >
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
                return (
                  <div key={t.id} className="flex flex-col gap-1 p-2 rounded-lg border border-neutral-800/50 bg-neutral-950/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-200">{t.name}</span>
                      <button onClick={async () => { if (confirm('Excluir tag?')) await deleteTag(t.id); }} className="text-neutral-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
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
              {audiences?.lists.map(l => (
                <div key={l.id} className="flex flex-col gap-1 p-2 rounded-lg border border-neutral-800/50 bg-neutral-950/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-200">{l.name}</span>
                    <button onClick={async () => { if (confirm('Excluir lista?')) await deleteList(l.id); }} className="text-neutral-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="text-[10px] text-neutral-500">{l.contactJids.length} contatos</div>
                </div>
              ))}
              {audiences?.lists.length === 0 && <div className="text-xs text-neutral-500 text-center py-2">Nenhuma lista</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
