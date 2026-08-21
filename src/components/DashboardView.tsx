import {
  Smartphone,
  MessageSquare,
  Activity,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  Clock,
  Sparkles,
  Zap,
  Users,
  Calendar
} from 'lucide-react';
import type { WhatsAppAccountInfo, ReceivedMessage, NavigationTab } from '../types';

interface DashboardViewProps {
  state: WhatsAppAccountInfo;
  messages: ReceivedMessage[];
  messagesCount: number;
  onNavigate: (tab: NavigationTab) => void;
}

export function DashboardView({
  state,
  messages,
  messagesCount,
  onNavigate,
}: DashboardViewProps) {
  const isConnected = state.status === 'connected';

  return (
    <div className="space-y-6" id="dashboard-view">
      {/* Welcome Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>North Code Zap • Painel de controle</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Visão geral do sistema
            </h1>
            <p className="text-sm text-neutral-400 max-w-xl leading-relaxed">
              Monitore a conexão do WhatsApp, acompanhe conversas em tempo real e gerencie seus agendamentos de mensagens.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              id="dashboard-btn-whatsapp"
              onClick={() => onNavigate('whatsapp')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 transition cursor-pointer"
            >
              <Smartphone className="w-4 h-4 text-emerald-400" />
              Gerenciar conexão
            </button>
            <button
              id="dashboard-btn-conversas"
              onClick={() => onNavigate('conversas')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 transition cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              Ver conversas
            </button>
            <button
              id="dashboard-btn-agendamentos"
              onClick={() => onNavigate('agendamentos')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              Ver agendamentos
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Metric 1: WhatsApp Status */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Status do WhatsApp</span>
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
              }`}
            >
              <Smartphone className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                }`}
              />
              <span className="text-xl font-bold text-white font-mono tracking-tight">
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1 truncate">
              {isConnected
                ? `${state.name || 'Conta conectada'} (${state.number ? `+${state.number}` : 'Ativo'})`
                : 'Nenhum aparelho conectado'}
            </p>
          </div>
        </div>

        {/* Metric 2: Messages Count */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Mensagens recebidas</span>
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
              {messagesCount}
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Recebidas em tempo real nesta sessão
            </p>
          </div>
        </div>

        {/* Metric 3: Active Engine */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3 shadow-md relative overflow-hidden sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Motor de Conexão</span>
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-white font-mono tracking-tight">
              Baileys WebSocket
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Sessão autônoma multi-device
            </p>
          </div>
        </div>
      </div>

      {/* Recent Messages Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Últimas mensagens recebidas</h2>
          </div>
          <button
            onClick={() => onNavigate('conversas')}
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
          >
            <span>Ver todas</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {messages.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-neutral-800 rounded-xl space-y-2">
            <p className="text-sm text-neutral-400">
              Nenhuma mensagem recebida ainda nesta sessão.
            </p>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Quando alguém enviar uma mensagem para o número conectado, ela aparecerá automaticamente aqui e na tela de Conversas.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {messages.slice(0, 5).map((msg) => {
              const formattedTime = new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const displayName = msg.pushName || (msg.number ? `+${msg.number}` : 'Contato');

              return (
                <div
                  key={msg.id}
                  onClick={() => onNavigate('conversas')}
                  className="p-3.5 rounded-xl bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-800/80 hover:border-neutral-700 transition flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-neutral-700/60 border border-neutral-600/40 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">
                          {displayName}
                        </span>
                        {msg.number && msg.pushName && (
                          <span className="text-[11px] text-neutral-400 font-mono truncate">
                            +{msg.number}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-300 truncate mt-0.5">
                        {msg.text}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono text-neutral-400">
                      {formattedTime}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
