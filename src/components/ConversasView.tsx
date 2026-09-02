import { useState, useMemo, useRef, useEffect, type KeyboardEvent } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Loader2,
  AlertCircle,
  Radio,
  Inbox,
  Clock,
  CheckCheck,
  WifiOff,
  RefreshCw,
  Users
} from 'lucide-react';
import type { ReceivedMessage, WhatsAppAccountInfo, KnownChat } from '../types';
import { useInstances } from '../contexts/InstancesContext';

interface ConversasViewProps {
  messages: ReceivedMessage[];
  state: WhatsAppAccountInfo;
  socketConnected: boolean;
  onSendMessage: (remoteJid: string, text: string) => Promise<{ success: boolean; error?: string }>;
}

type ViewMode = 'recentes' | 'todos';
type CatalogFilter = 'todos' | 'pessoas' | 'grupos' | 'arquivadas';

export function ConversasView({
  messages,
  state,
  socketConnected,
  onSendMessage,
}: ConversasViewProps) {
  const { selectedInstanceId } = useInstances();

  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedRemoteJid, setSelectedRemoteJid] = useState<string | null>(null);

  const [knownChats, setKnownChats] = useState<KnownChat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [selectedCatalogChatId, setSelectedCatalogChatId] = useState<string | null>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>('recentes');
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('todos');

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastFetchedInstanceRef = useRef<string | null>(null);

  const isConnected = state.status === 'connected';

  const fetchKnownChats = async () => {
    if (!selectedInstanceId) return;
    const instanceIdForFetch = selectedInstanceId;

    setChatsLoading(true);
    setChatsError(null);
    try {
      const res = await fetch(`/api/instances/${instanceIdForFetch}/whatsapp/chats`);
      if (!res.ok) {
        throw new Error(`Erro ${res.status}: falha ao carregar chats.`);
      }
      const data = await res.json();
      
      if (instanceIdForFetch === selectedInstanceId) {
        if (Array.isArray(data)) {
          setKnownChats(data);
        } else {
          setKnownChats([]);
          setChatsError('Formato de dados inválido.');
        }
      }
    } catch (err: any) {
      if (instanceIdForFetch === selectedInstanceId) {
        setChatsError(err.message || 'Erro ao carregar o catálogo de chats.');
      }
    } finally {
      if (instanceIdForFetch === selectedInstanceId) {
        setChatsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (selectedInstanceId !== lastFetchedInstanceRef.current) {
      setKnownChats([]);
      setChatsError(null);
      setSelectedCatalogChatId(null);
      lastFetchedInstanceRef.current = selectedInstanceId;
      if (selectedInstanceId) {
        fetchKnownChats();
      }
    }
  }, [selectedInstanceId]);

  const lastMessageId = messages[0]?.id;
  useEffect(() => {
    if (lastMessageId && selectedInstanceId) {
      fetchKnownChats();
    }
  }, [lastMessageId]);

  const conversations = useMemo(() => {
    const map = new Map<
      string,
      {
        remoteJid: string;
        number: string | null;
        pushName: string | null;
        lastMessage: ReceivedMessage;
        messages: ReceivedMessage[];
      }
    >();

    for (const msg of messages) {
      if (msg.remoteJid.endsWith('@g.us') || msg.remoteJid.includes('@broadcast')) {
        continue;
      }

      if (!map.has(msg.remoteJid)) {
        map.set(msg.remoteJid, {
          remoteJid: msg.remoteJid,
          number: msg.number,
          pushName: msg.pushName,
          lastMessage: msg,
          messages: [msg],
        });
      } else {
        const conv = map.get(msg.remoteJid)!;
        conv.messages.push(msg);
        if (!conv.pushName && msg.pushName) {
          conv.pushName = msg.pushName;
        }
      }
    }

    return Array.from(map.values());
  }, [messages]);

  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return conversations;
    const term = searchTerm.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.pushName && c.pushName.toLowerCase().includes(term)) ||
        (c.number && c.number.includes(term)) ||
        c.remoteJid.toLowerCase().includes(term) ||
        c.messages.some((m) => m.text.toLowerCase().includes(term))
    );
  }, [conversations, searchTerm]);

  const activeConversation = useMemo(() => {
    if (selectedRemoteJid) {
      const found = conversations.find((c) => c.remoteJid === selectedRemoteJid);
      if (found) return found;
    }
    return filteredConversations.length > 0 ? filteredConversations[0] : null;
  }, [conversations, filteredConversations, selectedRemoteJid]);

  const activeConversationMessages = useMemo(() => {
    if (!activeConversation) return [];
    return [...activeConversation.messages].sort((a, b) => a.timestamp - b.timestamp);
  }, [activeConversation]);

  const filteredKnownChats = useMemo(() => {
    let result = knownChats;
    
    if (catalogFilter === 'todos') {
      result = result.filter(c => !c.archived);
    } else if (catalogFilter === 'pessoas') {
      result = result.filter(c => c.type === 'private' && !c.archived);
    } else if (catalogFilter === 'grupos') {
      result = result.filter(c => c.type === 'group' && !c.archived);
    } else if (catalogFilter === 'arquivadas') {
      result = result.filter(c => c.archived === true);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c => 
        (c.name && c.name.toLowerCase().includes(term)) ||
        (c.number && c.number.includes(term)) ||
        (c.phoneJid && c.phoneJid.toLowerCase().includes(term)) ||
        (c.id && c.id.toLowerCase().includes(term))
      );
    }

    return result;
  }, [knownChats, catalogFilter, searchTerm]);

  const activeKnownChat = useMemo(() => {
    if (selectedCatalogChatId) {
      const found = knownChats.find((c) => c.id === selectedCatalogChatId);
      if (found) return found;
    }
    return null;
  }, [knownChats, selectedCatalogChatId]);

  const activeKnownChatMessages = useMemo(() => {
    if (!activeKnownChat) return [];
    
    const aliases = new Set(
      [
        activeKnownChat.id,
        activeKnownChat.addressJid,
        activeKnownChat.phoneJid,
        activeKnownChat.lidJid,
      ].filter(Boolean) as string[]
    );

    const relatedMessages = messages.filter(msg => aliases.has(msg.remoteJid));
    return relatedMessages.sort((a, b) => a.timestamp - b.timestamp);
  }, [activeKnownChat, messages]);

  const getChatDisplayName = (chat: KnownChat) => {
    if (chat.type === 'group') {
      return chat.name || 'Grupo';
    }
    
    if (chat.name) return chat.name;
    if (chat.number) return `+${chat.number}`;
    return 'Contato sem telefone';
  };

  const formatTime = (timestamp: number | string | null | undefined) => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversationMessages.length, activeKnownChatMessages.length, selectedRemoteJid, selectedCatalogChatId, viewMode]);

  const handleSelectConversation = (remoteJid: string) => {
    setSelectedRemoteJid(remoteJid);
    setSendError(null);
  };

  const handleSelectKnownChat = (id: string) => {
    setSelectedCatalogChatId(id);
    setSendError(null);
  };

  const handleSend = async () => {
    if (isSending || !isConnected || !inputText.trim()) return;

    let targetJid: string | null = null;

    if (viewMode === 'recentes') {
      if (!activeConversation) return;
      targetJid = activeConversation.remoteJid;
    } else {
      if (!activeKnownChat || !activeKnownChat.addressJid) return;
      targetJid = activeKnownChat.addressJid;
    }

    if (!targetJid) return;

    const textToSend = inputText.trim();

    setIsSending(true);
    setSendError(null);

    try {
      const result = await onSendMessage(targetJid, textToSend);

      if (result.success) {
        setInputText('');
        setSendError(null);
        if (viewMode === 'todos') {
          fetchKnownChats();
        }
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 50);
      } else {
        setSendError(result.error || 'Falha ao enviar mensagem');
      }
    } catch (err: any) {
      setSendError(err?.message || 'Erro inesperado ao enviar mensagem');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-6" id="conversas-view">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Conversas e mensagens
              </h1>
            </div>
            <p className="text-xs text-neutral-400">
              Recebimento e envio manual de mensagens em tempo real via Baileys
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-800 border border-neutral-700 text-xs">
              <Radio
                className={`w-3.5 h-3.5 ${
                  socketConnected ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'
                }`}
              />
              <span className="text-neutral-300 font-mono text-[11px]">
                {viewMode === 'recentes'
                  ? `${conversations.length} conversas (${messages.length} msgs)`
                  : `${knownChats.length} chats`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Tempo real</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800/60">
          <div className="flex bg-neutral-950 rounded-xl p-1 border border-neutral-800">
            <button
              onClick={() => { setViewMode('recentes'); setSearchTerm(''); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'recentes'
                  ? 'bg-neutral-800 text-emerald-400 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Recentes
            </button>
            <button
              onClick={() => { setViewMode('todos'); setSearchTerm(''); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'todos'
                  ? 'bg-neutral-800 text-emerald-400 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Todos os chats
            </button>
          </div>

          {viewMode === 'todos' && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={fetchKnownChats}
                disabled={chatsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-neutral-300 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${chatsLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[580px]">
        <div className="lg:col-span-5 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-xl flex flex-col space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar contato ou mensagem..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-neutral-800/80 border border-neutral-700/80 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {viewMode === 'todos' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(['todos', 'pessoas', 'grupos', 'arquivadas'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setCatalogFilter(filter)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize transition border ${
                    catalogFilter === filter
                      ? 'bg-neutral-800 text-white border-neutral-600'
                      : 'bg-transparent text-neutral-500 border-neutral-800 hover:text-neutral-300'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto scrollbar-hidden space-y-2 max-h-[640px] pr-1">
            {viewMode === 'recentes' ? (
              filteredConversations.length === 0 ? (
                <div className="py-16 text-center space-y-3 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-neutral-800/80 border border-neutral-700/50 flex items-center justify-center text-neutral-500 mx-auto">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-neutral-300">
                      {searchTerm ? 'Nenhuma conversa encontrada' : 'Aguardando mensagens...'}
                    </p>
                    <p className="text-xs text-neutral-500 leading-relaxed">
                      {searchTerm
                        ? 'Tente buscar com outro nome ou número.'
                        : isConnected
                        ? 'Envie uma mensagem do seu WhatsApp para o número conectado para iniciar a conversa.'
                        : 'Conecte seu WhatsApp na aba "WhatsApp" para começar a receber e responder mensagens.'}
                    </p>
                  </div>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = activeConversation?.remoteJid === conv.remoteJid;
                  const lastMsg = conv.lastMessage;
                  const formattedTime = formatTime(lastMsg.timestamp);
                  const displayName = conv.pushName || (conv.number ? `+${conv.number}` : 'Contato');

                  return (
                    <div
                      key={conv.remoteJid}
                      id={`conversation-${conv.remoteJid.replace(/[^a-zA-Z0-9]/g, '_')}`}
                      onClick={() => handleSelectConversation(conv.remoteJid)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer text-left ${
                        isSelected
                          ? 'bg-neutral-800 border-emerald-500/50 shadow-md'
                          : 'bg-neutral-800/40 hover:bg-neutral-800/80 border-neutral-800/80 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isSelected
                                ? 'bg-emerald-500 text-black font-extrabold'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white truncate block">
                              {displayName}
                            </span>
                            {conv.number && (
                              <span className="text-[10px] font-mono text-neutral-400 truncate block">
                                +{conv.number}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                          {formattedTime}
                        </span>
                      </div>

                      <div className="pl-10.5">
                        <p className="text-xs text-neutral-300 line-clamp-1 leading-relaxed flex items-center gap-1.5">
                          {lastMsg.direction === 'outgoing' && (
                            <span className="text-[10px] text-emerald-400 font-semibold shrink-0">
                              Você:
                            </span>
                          )}
                          <span className="truncate">{lastMsg.text}</span>
                        </p>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              chatsLoading && knownChats.length === 0 ? (
                <div className="py-16 flex justify-center">
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                </div>
              ) : chatsError && knownChats.length === 0 ? (
                <div className="py-10 text-center space-y-3 px-4">
                  <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
                  <p className="text-xs text-red-400">{chatsError}</p>
                  <button onClick={fetchKnownChats} className="text-xs text-neutral-300 hover:text-white underline">
                    Tentar novamente
                  </button>
                </div>
              ) : knownChats.length === 0 ? (
                <div className="py-16 text-center space-y-3 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-neutral-800/80 border border-neutral-700/50 flex items-center justify-center text-neutral-500 mx-auto">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-neutral-300">Nenhum chat sincronizado ainda.</p>
                </div>
              ) : filteredKnownChats.length === 0 ? (
                <div className="py-16 text-center space-y-3 px-4">
                  <p className="text-sm font-semibold text-neutral-300">
                    {searchTerm ? 'Nenhum chat corresponde à busca.' : 'Nenhum chat encontrado neste filtro.'}
                  </p>
                </div>
              ) : (
                filteredKnownChats.map((chat) => {
                  const isSelected = activeKnownChat?.id === chat.id;
                  const formattedTime = formatTime(chat.lastMessageAt || chat.updatedAt);
                  const displayName = getChatDisplayName(chat);
                  
                  return (
                    <div
                      key={chat.id}
                      onClick={() => handleSelectKnownChat(chat.id)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer text-left ${
                        isSelected
                          ? 'bg-neutral-800 border-emerald-500/50 shadow-md'
                          : 'bg-neutral-800/40 hover:bg-neutral-800/80 border-neutral-800/80 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isSelected
                                ? 'bg-emerald-500 text-black font-extrabold'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {chat.type === 'group' ? <Users className="w-4 h-4" /> : displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex items-center gap-2">
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-white truncate block">
                                {displayName}
                              </span>
                              {chat.type === 'group' && chat.participantsCount !== null && (
                                <span className="text-[10px] font-mono text-neutral-400 truncate block">
                                  {chat.participantsCount} participantes
                                </span>
                              )}
                              {chat.type === 'private' && chat.number && (
                                <span className="text-[10px] font-mono text-neutral-400 truncate block">
                                  +{chat.number}
                                </span>
                              )}
                            </div>
                            
                            {chat.archived && (
                              <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[9px] text-neutral-400 uppercase tracking-wider shrink-0">
                                Arquivada
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[11px] font-mono text-neutral-400">
                            {formattedTime}
                          </span>
                          {typeof chat.unreadCount === 'number' && chat.unreadCount > 0 && (
                            <span className="w-4 h-4 flex items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-black">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pl-10.5">
                        <p className="text-xs text-neutral-300 line-clamp-1 leading-relaxed">
                          {chat.lastMessagePreview || <span className="text-neutral-500 italic">Nenhuma mensagem recente</span>}
                        </p>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
          {(viewMode === 'recentes' && activeConversation) || (viewMode === 'todos' && activeKnownChat) ? (
            <>
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-neutral-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-emerald-400 text-base font-bold shrink-0">
                    {viewMode === 'recentes' && activeConversation 
                      ? (activeConversation.pushName || activeConversation.number || 'W').charAt(0).toUpperCase()
                      : viewMode === 'todos' && activeKnownChat
                      ? (activeKnownChat.type === 'group' ? <Users className="w-5 h-5" /> : getChatDisplayName(activeKnownChat).charAt(0).toUpperCase())
                      : 'W'
                    }
                  </div>
                  <div className="min-w-0">
                    {viewMode === 'recentes' && activeConversation && (
                      <>
                        <h3 className="text-sm font-bold text-white truncate">
                          {activeConversation.pushName ||
                            (activeConversation.number
                              ? `+${activeConversation.number}`
                              : 'Contato')}
                        </h3>
                        <p className="text-[11px] text-emerald-400 font-mono truncate">
                          {activeConversation.number
                            ? `+${activeConversation.number}`
                            : activeConversation.remoteJid}
                        </p>
                      </>
                    )}
                    {viewMode === 'todos' && activeKnownChat && (
                      <>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2 truncate">
                          <span className="truncate">{getChatDisplayName(activeKnownChat)}</span>
                          {activeKnownChat.archived && (
                            <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[9px] text-neutral-400 uppercase tracking-wider font-normal shrink-0">
                              Arquivada
                            </span>
                          )}
                        </h3>
                        <p className="text-[11px] text-emerald-400 font-mono flex items-center gap-2 truncate mt-0.5">
                          {activeKnownChat.type === 'private' && activeKnownChat.number ? (
                            <>+{activeKnownChat.number}</>
                          ) : activeKnownChat.type === 'group' ? (
                            <>{activeKnownChat.participantsCount !== null ? `${activeKnownChat.participantsCount} participantes` : 'Grupo'}</>
                          ) : (
                            <>Contato</>
                          )}
                          
                          {typeof activeKnownChat.unreadCount === 'number' && activeKnownChat.unreadCount > 0 && (
                            <span className="text-emerald-400 font-bold ml-1 shrink-0">
                              ({activeKnownChat.unreadCount} não lidas)
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
                      isConnected
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                      }`}
                    />
                    <span>{isConnected ? 'PRONTO PARA ENVIO' : 'OFFLINE'}</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-hidden max-h-[380px] min-h-[260px] space-y-3.5 p-2 pr-3 flex flex-col">
                {viewMode === 'recentes' ? (
                  <>
                    {activeConversationMessages.map((msg) => {
                      const isOutgoing = msg.direction === 'outgoing';
                      const formattedTime = formatTime(msg.timestamp);

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-neutral-400 font-mono">
                            <span>{isOutgoing ? 'Eu (North Code Zap)' : msg.pushName || 'Contato'}</span>
                            <span>•</span>
                            <span>{formattedTime}</span>
                          </div>

                          <div
                            className={`max-w-[85%] sm:max-w-[75%] p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-md ${
                              isOutgoing
                                ? 'bg-emerald-600 text-white rounded-tr-sm'
                                : 'bg-neutral-800/90 text-neutral-100 border border-neutral-700/70 rounded-tl-sm'
                            }`}
                          >
                            {msg.text}
                          </div>

                          <div className="px-1 mt-1 flex items-center gap-1 text-[10px] text-neutral-500 font-mono">
                            {isOutgoing ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400/80">
                                <CheckCheck className="w-3 h-3" /> Enviada
                              </span>
                            ) : (
                              <span>Recebida</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                ) : (
                  <>
                    {activeKnownChatMessages.length > 0 ? (
                      <>
                        {activeKnownChatMessages.map((msg) => {
                          const isOutgoing = msg.direction === 'outgoing';
                          const formattedTime = formatTime(msg.timestamp);

                          return (
                            <div
                              key={msg.id}
                              className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}
                            >
                              <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-neutral-400 font-mono">
                                <span>{isOutgoing ? 'Eu (North Code Zap)' : msg.pushName || 'Contato'}</span>
                                <span>•</span>
                                <span>{formattedTime}</span>
                              </div>

                              <div
                                className={`max-w-[85%] sm:max-w-[75%] p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-md ${
                                  isOutgoing
                                    ? 'bg-emerald-600 text-white rounded-tr-sm'
                                    : 'bg-neutral-800/90 text-neutral-100 border border-neutral-700/70 rounded-tl-sm'
                                }`}
                              >
                                {msg.text}
                              </div>

                              <div className="px-1 mt-1 flex items-center gap-1 text-[10px] text-neutral-500 font-mono">
                                {isOutgoing ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-400/80">
                                    <CheckCheck className="w-3 h-3" /> Enviada
                                  </span>
                                ) : (
                                  <span>Recebida</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center space-y-3 opacity-60 my-auto">
                        <Clock className="w-8 h-8 text-neutral-500" />
                        <div className="text-center">
                          <p className="text-sm font-semibold text-neutral-300">
                            Histórico detalhado não disponível nesta sessão.
                          </p>
                          <p className="text-xs text-neutral-500 mt-1">
                            O catálogo mantém apenas a última atividade sincronizada.
                          </p>
                        </div>
                        {activeKnownChat?.lastMessagePreview && (
                          <div className="mt-4 p-4 rounded-xl bg-neutral-800/50 border border-neutral-700/50 max-w-sm text-left w-full">
                            <p className="text-[10px] font-mono text-neutral-400 mb-1">ÚLTIMA ATIVIDADE ({formatTime(activeKnownChat.lastMessageAt)})</p>
                            <p className="text-xs text-neutral-300">{activeKnownChat.lastMessagePreview}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {sendError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{sendError}</span>
                  </div>
                  <button
                    onClick={() => setSendError(null)}
                    className="text-neutral-400 hover:text-white text-xs cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {!isConnected && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <WifiOff className="w-4 h-4 shrink-0" />
                  <span>
                    O WhatsApp está desconectado. Conecte sua conta na aba "WhatsApp" para habilitar o envio.
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-neutral-800 space-y-2">
                <div className="relative bg-neutral-950/70 border border-neutral-800 rounded-xl p-2.5 focus-within:border-emerald-500/50 transition">
                  <textarea
                    ref={textareaRef}
                    id="composer-textarea"
                    rows={2}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={
                      !isConnected ||
                      isSending ||
                      (viewMode === 'todos' && !activeKnownChat?.addressJid)
                    }
                    placeholder={
                      isConnected
                        ? 'Digite sua mensagem... (Enter para enviar, Shift+Enter para nova linha)'
                        : 'Conecte o WhatsApp para responder...'
                    }
                    className="w-full bg-transparent text-white text-xs placeholder-neutral-500 focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />

                  <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60 mt-1">
                    <div className="text-[11px] text-neutral-500 font-mono flex items-center gap-1.5">
                      <span>Destinatário:</span>
                      <span className="text-neutral-400 font-bold select-all">
                        {viewMode === 'recentes' && activeConversation
                          ? (activeConversation.number ? `+${activeConversation.number}` : activeConversation.remoteJid)
                          : viewMode === 'todos' && activeKnownChat
                          ? (activeKnownChat.addressJid || 'Nenhum endereço operacional')
                          : 'Nenhum'}
                      </span>
                    </div>

                    <button
                      id="composer-btn-send"
                      onClick={handleSend}
                      disabled={
                        !isConnected ||
                        !inputText.trim() ||
                        isSending ||
                        (viewMode === 'todos' && !activeKnownChat?.addressJid)
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:border-neutral-700 disabled:cursor-not-allowed text-black shadow-lg shadow-emerald-500/10 transition cursor-pointer"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Enviando...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>ENVIAR</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-6 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-neutral-800/60 border border-neutral-700/50 flex items-center justify-center text-neutral-500">
                <MessageSquare className="w-8 h-8" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h3 className="text-base font-bold text-white">Nenhuma conversa selecionada</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {viewMode === 'recentes'
                    ? 'Envie uma mensagem do seu celular para o WhatsApp conectado para que ela apareça na lista ao lado, ou selecione uma conversa existente para responder.'
                    : 'Selecione um chat na lista ao lado para enviar uma mensagem ou visualizar a última atividade sincronizada.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
