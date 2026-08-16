import { useState, useMemo, useRef, useEffect, type KeyboardEvent } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Loader2,
  AlertCircle,
  Radio,
  Inbox,
  User,
  Phone,
  Clock,
  CheckCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import type { ReceivedMessage, WhatsAppAccountInfo } from '../types';

interface ConversasViewProps {
  messages: ReceivedMessage[];
  state: WhatsAppAccountInfo;
  socketConnected: boolean;
  onSendMessage: (remoteJid: string, text: string) => Promise<{ success: boolean; error?: string }>;
}

export function ConversasView({
  messages,
  state,
  socketConnected,
  onSendMessage,
}: ConversasViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRemoteJid, setSelectedRemoteJid] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isConnected = state.status === 'connected';

  // Group messages into distinct conversations by remoteJid
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

    // Messages are stored with newest first
    for (const msg of messages) {
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

  // Filter conversations by search term
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

  // Determine active selected conversation
  const activeConversation = useMemo(() => {
    if (selectedRemoteJid) {
      const found = conversations.find((c) => c.remoteJid === selectedRemoteJid);
      if (found) return found;
    }
    // Default to the first conversation if available
    return filteredConversations.length > 0 ? filteredConversations[0] : null;
  }, [conversations, filteredConversations, selectedRemoteJid]);

  // Chronologically sorted messages for the active conversation (oldest to newest)
  const activeConversationMessages = useMemo(() => {
    if (!activeConversation) return [];
    return [...activeConversation.messages].sort((a, b) => a.timestamp - b.timestamp);
  }, [activeConversation]);

  // Auto-scroll to bottom of chat on new messages or conversation switch
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversationMessages.length, selectedRemoteJid]);

  const handleSelectConversation = (remoteJid: string) => {
    setSelectedRemoteJid(remoteJid);
    setSendError(null);
  };

  const handleSend = async () => {
    if (!activeConversation || !inputText.trim() || isSending || !isConnected) {
      return;
    }

    const textToSend = inputText.trim();
    const targetJid = activeConversation.remoteJid;

    setIsSending(true);
    setSendError(null);

    try {
      const result = await onSendMessage(targetJid, textToSend);

      if (result.success) {
        setInputText('');
        setSendError(null);
        // Focus back to textarea
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
      {/* Header Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
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
                {conversations.length} conversas ({messages.length} msgs)
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Tempo real</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Layout (2 Columns: List on left, Chat & Composer on right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[580px]">
        {/* Left Column: Conversations List (5 cols) */}
        <div className="lg:col-span-5 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-xl flex flex-col space-y-3">
          {/* Search Input */}
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

          {/* Conversations Feed */}
          <div className="flex-1 overflow-y-auto scrollbar-hidden space-y-2 max-h-[640px] pr-1">
            {filteredConversations.length === 0 ? (
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
                const formattedTime = new Date(lastMsg.timestamp).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
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
            )}
          </div>
        </div>

        {/* Right Column: Chat History & Message Composer (7 cols) */}
        <div className="lg:col-span-7 bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
          {activeConversation ? (
            <>
              {/* Header: Contact & Connection Info */}
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-neutral-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-emerald-400 text-base font-bold shrink-0">
                    {(activeConversation.pushName || activeConversation.number || 'W')
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
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
                  </div>
                </div>

                <div className="flex items-center gap-2">
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

              {/* Message Bubble History Feed */}
              <div className="flex-1 overflow-y-auto scrollbar-hidden max-h-[380px] min-h-[260px] space-y-3.5 p-2 pr-3">
                {activeConversationMessages.map((msg) => {
                  const isOutgoing = msg.direction === 'outgoing';
                  const formattedTime = new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

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
              </div>

              {/* Error Banner if sending fails */}
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

              {/* Offline Warning Banner */}
              {!isConnected && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <WifiOff className="w-4 h-4 shrink-0" />
                  <span>
                    O WhatsApp está desconectado. Conecte sua conta na aba "WhatsApp" para habilitar o envio.
                  </span>
                </div>
              )}

              {/* Composer (Textarea + Send button) */}
              <div className="pt-2 border-t border-neutral-800 space-y-2">
                <div className="relative bg-neutral-950/70 border border-neutral-800 rounded-xl p-2.5 focus-within:border-emerald-500/50 transition">
                  <textarea
                    ref={textareaRef}
                    id="composer-textarea"
                    rows={2}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!isConnected || isSending}
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
                        {activeConversation.number ? `+${activeConversation.number}` : activeConversation.remoteJid}
                      </span>
                    </div>

                    <button
                      id="composer-btn-send"
                      onClick={handleSend}
                      disabled={!isConnected || !inputText.trim() || isSending}
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
                  Envie uma mensagem do seu celular para o WhatsApp conectado para que ela apareça na lista ao lado, ou selecione uma conversa existente para responder.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
