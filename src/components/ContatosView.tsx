import React, { useState, useMemo } from 'react';
import { 
  Users, RefreshCw, Search, Loader2, UserCircle2, 
  MessageSquare, UserPlus, MessageCircle
} from 'lucide-react';
import { useContacts } from '../hooks/useContacts';
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
  
  if (targetDate.getTime() === today.getTime()) {
    return `Hoje, ${timeStr}`;
  } else if (targetDate.getTime() === yesterday.getTime()) {
    return `Ontem, ${timeStr}`;
  }
  
  const dateStr = date.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
  
  return `${dateStr}, ${timeStr}`;
}

export function ContatosView() {
  const { contacts, loading, error, fetchContacts } = useContacts();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const metrics = useMemo(() => {
    let withName = 0;
    let withoutName = 0;
    let recentActive = 0;
    
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    contacts.forEach(c => {
      if (c.name?.trim()) {
        withName++;
      } else {
        withoutName++;
      }
      if (c.lastSeenAt) {
        const d = new Date(c.lastSeenAt);
        if (!isNaN(d.getTime()) && d >= sevenDaysAgo) {
          recentActive++;
        }
      }
    });

    return {
      total: contacts.length,
      withName,
      withoutName,
      recentActive
    };
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      if (sourceFilter !== 'all' && c.source !== sourceFilter) {
        return false;
      }
      
      if (search.trim()) {
        const term = search.toLowerCase();
        const n = (c.name || '').toLowerCase();
        const num = (c.number || '').toLowerCase();
        if (!n.includes(term) && !num.includes(term)) {
          return false;
        }
      }
      
      return true;
    });
  }, [contacts, search, sourceFilter]);

  // Reset page when search or filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, sourceFilter, pageSize]);

  // Ensure current page doesn't exceed total pages if filtered list shrinks
  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));
  React.useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  if (loading && contacts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (error && contacts.length === 0) {
    return (
      <div className="bg-neutral-900 border border-rose-500/30 rounded-2xl p-6 shadow-xl text-center max-w-md mx-auto mt-10">
        <UserCircle2 className="w-10 h-10 text-rose-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-white mb-2">Não foi possível carregar os contatos</h2>
        <p className="text-sm text-neutral-400 mb-6">{error}</p>
        <Button variant="secondary" onClick={fetchContacts}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (contacts.length === 0 && !loading) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-xl text-center max-w-md mx-auto mt-10">
        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-emerald-400">
          <Users className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-3">Nenhum contato encontrado</h2>
        <p className="text-sm text-neutral-400 leading-relaxed mb-6">
          Os contatos reconhecidos pelas conversas e interações do WhatsApp aparecerão aqui automaticamente.
        </p>
        <Button variant="primary-soft" onClick={fetchContacts}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar agora
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Contatos</h1>
              <p className="text-sm text-neutral-400 mt-1">
                Diretório de contatos reconhecidos e persistidos pela plataforma.
              </p>
            </div>
          </div>
          <Button 
            variant="secondary" 
            onClick={fetchContacts}
            disabled={loading}
            className="shrink-0"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-md">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Total de Contatos</p>
          <p className="text-2xl font-bold text-white font-mono">{metrics.total}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-md">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Com Nome</p>
          <p className="text-2xl font-bold text-emerald-400 font-mono">{metrics.withName}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-md">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Sem Nome</p>
          <p className="text-2xl font-bold text-amber-400 font-mono">{metrics.withoutName}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-md">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Ativos Recentemente</p>
          <p className="text-2xl font-bold text-blue-400 font-mono">{metrics.recentActive}</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-md space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Buscar por nome ou número..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-neutral-600"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            {['all', 'message', 'contact', 'chat'].map((src) => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  sourceFilter === src 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {src === 'all' ? 'Todos' : getSourceLabel(src)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Counter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
        <div className="text-xs font-medium text-neutral-400">
          {filteredContacts.length > 0 ? (
            <>
              Exibindo {Math.min((currentPage - 1) * pageSize + 1, filteredContacts.length)}–
              {Math.min(currentPage * pageSize, filteredContacts.length)} de {filteredContacts.length} resultados
              {search || sourceFilter !== 'all' ? ` • ${contacts.length} contatos no diretório` : ''}
            </>
          ) : (
            <>
              0 resultados {search || sourceFilter !== 'all' ? ` • ${contacts.length} contatos no diretório` : ''}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Resultados por página:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white px-2 py-1 focus:outline-none focus:border-emerald-500"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* List */}
      {filteredContacts.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-md text-center">
          <p className="text-sm text-neutral-400 mb-4">Nenhum contato corresponde aos filtros.</p>
          <Button variant="ghost" onClick={() => { setSearch(''); setSourceFilter('all'); }}>
            Limpar filtros
          </Button>
        </div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/50">
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Contato</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Número</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Origem</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider text-right">Última Atividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {paginatedContacts.map((c, i) => (
                  <tr key={c.jid || i} className="hover:bg-neutral-800/20 transition-colors group">
                    <td className="px-5 py-3 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-300 shrink-0">
                          {getInitial(c.name)}
                        </div>
                        <div className="flex flex-col min-w-0" title={c.jid}>
                          <span className={`text-sm font-semibold truncate ${c.name ? 'text-white' : 'text-neutral-400'}`}>
                            {getDisplayName(c)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 align-middle">
                      <span className="text-sm font-mono text-neutral-300 whitespace-nowrap">
                        {formatBrazilianNumber(c.number)}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-800 text-[11px] font-medium text-neutral-400 whitespace-nowrap">
                        {getSourceIcon(c.source)}
                        {getSourceLabel(c.source)}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle text-right">
                      <span className="text-xs text-neutral-400 whitespace-nowrap">
                        {formatLastSeen(c.lastSeenAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="border-t border-neutral-800/80 p-4 flex items-center justify-between sm:justify-center gap-4 bg-neutral-950/30">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              
              <div className="hidden sm:flex items-center gap-1">
                {getPageNumbers().map((pageNum, idx) => (
                  <button
                    key={idx}
                    disabled={pageNum === '...'}
                    onClick={() => typeof pageNum === 'number' && setCurrentPage(pageNum)}
                    className={`min-w-[28px] h-7 px-2 rounded flex items-center justify-center text-xs font-medium transition-colors ${
                      pageNum === currentPage
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : pageNum === '...'
                        ? 'text-neutral-500 cursor-default'
                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-white border border-transparent'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>

              <span className="sm:hidden text-xs text-neutral-400">
                Página {currentPage} de {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
