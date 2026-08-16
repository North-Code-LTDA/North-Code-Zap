import { useState, useMemo } from 'react';
import {
  MessageSquare,
  Search,
  User,
  Phone,
  Clock,
  Radio,
  Sparkles,
  Inbox,
  ShieldCheck,
  Hash,
  Filter
} from 'lucide-react';
import type { ReceivedMessage, WhatsAppAccountInfo } from '../types';

interface ConversasViewProps {
  messages: ReceivedMessage[];
  state: WhatsAppAccountInfo;
  socketConnected: boolean;
}

export function ConversasView({ messages, state, socketConnected }: ConversasViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const filteredMessages = useMemo(() => {
    if (!searchTerm.trim()) return messages;
    const term = searchTerm.toLowerCase();
    return messages.filter(
      (m) =>
        (m.pushName && m.pushName.toLowerCase().includes(term)) ||
        (m.number && m.number.includes(term)) ||
        m.text.toLowerCase().includes(term) ||
        m.remoteJid.toLowerCase().includes(term)
    );
  }, [messages, searchTerm]);

  const selectedMessage = useMemo(() => {
    if (!selectedMessageId && filteredMessages.length > 0) {
      return filteredMessages[0];
    }
    return filteredMessages.find((m) => m.id === selectedMessageId) || null;
  }, [filteredMessages, selectedMessageId]);

  const isConnected = state.status === 'connected';

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
                Conversas & Mensagens
              </h1>
            </div>
            <p className="text-xs text-neutral-400">
              Visualização em tempo real das mensagens recebidas pelo Baileys
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-800 border border-neutral-700 text-xs">
              <Radio className={`w-3.5 h-3.5 ${socketConnected ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'}`} />
              <span className="text-neutral-300 font-mono text-[11px]">
                {messages.length} recebidas
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>TEMPO REAL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Inbox Layout (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
        {/* Left Column: Messages List (5 cols) */}
        <div className="lg:col-span-5 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-xl flex flex-col space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, número ou texto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-neutral-800/80 border border-neutral-700/80 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[600px] pr-1">
            {filteredMessages.length === 0 ? (
              <div className="py-16 text-center space-y-3 px-4">
                <div className="w-12 h-12 rounded-2xl bg-neutral-800/80 border border-neutral-700/50 flex items-center justify-center text-neutral-500 mx-auto">
                  <Inbox className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-neutral-300">
                    {searchTerm ? 'Nenhuma mensagem encontrada' : 'Aguardando mensagens...'}
                  </p>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    {searchTerm
                      ? 'Tente ajustar os termos da busca.'
                      : isConnected
                      ? 'Envie uma mensagem de outro WhatsApp para o número conectado para ver ela aparecer instantaneamente aqui.'
                      : 'Conecte seu WhatsApp na aba "WhatsApp" para começar a receber mensagens.'}
                  </p>
                </div>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isSelected = selectedMessage?.id === msg.id;
                const formattedTime = new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const displayName = msg.pushName || (msg.number ? `+${msg.number}` : 'Contato');

                return (
                  <div
                    key={msg.id}
                    onClick={() => setSelectedMessageId(msg.id)}
                    className={`p-3.5 rounded-xl border transition cursor-pointer text-left ${
                      isSelected
                        ? 'bg-neutral-800 border-emerald-500/40 shadow-md'
                        : 'bg-neutral-800/40 hover:bg-neutral-800/80 border-neutral-800/80 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-xs font-bold shrink-0">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-bold text-white truncate">
                          {displayName}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                        {formattedTime}
                      </span>
                    </div>

                    <div className="pl-9 space-y-1">
                      {msg.number && (
                        <p className="text-[11px] font-mono text-neutral-400 truncate">
                          +{msg.number}
                        </p>
                      )}
                      <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
                        {msg.text}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Message Details (7 cols) */}
        <div className="lg:col-span-7 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          {selectedMessage ? (
            <div className="space-y-6">
              {/* Sender Info Banner */}
              <div className="flex items-start justify-between gap-4 pb-5 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-emerald-400 text-lg font-bold">
                    {(selectedMessage.pushName || selectedMessage.number || 'W').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {selectedMessage.pushName || (selectedMessage.number ? `+${selectedMessage.number}` : 'Contato Desconhecido')}
                    </h3>
                    <p className="text-xs text-emerald-400 font-mono">
                      {selectedMessage.number ? `+${selectedMessage.number}` : 'Número não identificado'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                    Tipo: {selectedMessage.type}
                  </span>
                  <div className="text-xs text-neutral-400 mt-1 font-mono">
                    {new Date(selectedMessage.timestamp).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>

              {/* Message Bubble Card */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 font-mono">
                  Conteúdo da Mensagem
                </span>
                <div className="p-4 rounded-xl bg-neutral-800/70 border border-neutral-700/60 text-white font-sans text-sm leading-relaxed whitespace-pre-wrap shadow-inner">
                  {selectedMessage.text}
                </div>
              </div>

              {/* Technical Metadata Details */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 font-mono">
                  Metadados do Baileys
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800 space-y-1">
                    <span className="text-[10px] text-neutral-500 block">ID da Mensagem</span>
                    <span className="text-neutral-300 break-all select-all">{selectedMessage.id}</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800 space-y-1">
                    <span className="text-[10px] text-neutral-500 block">Remote JID</span>
                    <span className="text-neutral-300 break-all select-all">{selectedMessage.remoteJid}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-6 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-neutral-800/60 border border-neutral-700/50 flex items-center justify-center text-neutral-500">
                <MessageSquare className="w-8 h-8" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h3 className="text-base font-bold text-white">Nenhuma conversa selecionada</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Selecione uma mensagem na lista à esquerda ou envie uma mensagem do seu celular para visualizar os detalhes completos nesta tela.
                </p>
              </div>
            </div>
          )}

          {/* Footer status tip */}
          <div className="pt-4 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400">
            <span className="font-mono">North Code Zap • Protocolo Baileys</span>
            <span className="text-neutral-500">Envio de respostas estará disponível na próxima etapa</span>
          </div>
        </div>
      </div>
    </div>
  );
}
