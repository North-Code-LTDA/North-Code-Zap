import { useState } from 'react';
import {
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Phone,
  User,
  Radio,
  ArrowRight
} from 'lucide-react';
import type { WhatsAppAccountInfo } from '../types';

interface ConnectionCardProps {
  state: WhatsAppAccountInfo;
  loading: boolean;
  socketConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectionCard({
  state,
  loading,
  socketConnected,
  onConnect,
  onDisconnect,
}: ConnectionCardProps) {
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const getStatusBadge = () => {
    switch (state.status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Conectado
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Conectando...
          </span>
        );
      case 'qr':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <QrCode className="w-3.5 h-3.5" />
            Aguardando leitura
          </span>
        );
      case 'authenticated':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            Autenticado
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3.5 h-3.5" />
            Erro
          </span>
        );
      case 'disconnected':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700">
            <span className="w-2 h-2 rounded-full bg-neutral-500"></span>
            Desconectado
          </span>
        );
    }
  };

  return (
    <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl relative overflow-hidden" id="whatsapp-connection-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-emerald-400 shadow-inner">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Conexão do WhatsApp
            </h2>
            <p className="text-xs text-neutral-400">
              Conexão Baileys com sincronização em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className={`w-3.5 h-3.5 ${socketConnected ? 'text-emerald-400' : 'text-neutral-500'}`} />
            <span className="text-xs text-neutral-400 font-mono">
              {socketConnected ? 'Socket Ativo' : 'Socket Offline'}
            </span>
          </div>
          {getStatusBadge()}
        </div>
      </div>

      {/* Body Content per State */}
      <div className="py-6">
        {/* STATE: DISCONNECTED */}
        {state.status === 'disconnected' && (
          <div className="flex flex-col items-center text-center py-6 px-4 space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-neutral-800/80 border border-neutral-700/60 flex items-center justify-center text-neutral-400 shadow-inner">
              <QrCode className="w-10 h-10 text-neutral-300" />
            </div>

            <div className="max-w-md space-y-2">
              <h3 className="text-base font-semibold text-white">
                Nenhum WhatsApp conectado
              </h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Clique no botão abaixo para gerar o QR Code real do Baileys e conectar seu número do WhatsApp diretamente à North Code Zap.
              </p>
            </div>

            {state.error && (
              <div className="w-full max-w-md p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{state.error}</span>
              </div>
            )}

            <button
              id="btn-connect-whatsapp"
              onClick={onConnect}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Iniciando Baileys...
                </>
              ) : (
                <>
                  <Smartphone className="w-4 h-4" />
                  CONECTAR WHATSAPP
                </>
              )}
            </button>
          </div>
        )}

        {/* STATE: CONNECTING (Without QR yet or during 515 restart) */}
        {state.status === 'connecting' && (
          <div className="flex flex-col items-center text-center py-10 space-y-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-emerald-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">Finalizando conexão...</h3>
              <p className="text-sm text-neutral-400">
                Sincronizando chaves e autenticando sessão com o WhatsApp...
              </p>
            </div>
          </div>
        )}

        {/* STATE: QR CODE READY */}
        {state.status === 'qr' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-2">
            {/* Left: QR Code Box */}
            <div className="lg:col-span-6 flex flex-col items-center">
              <div className="p-4 bg-white rounded-2xl shadow-2xl border-4 border-emerald-500/30 flex flex-col items-center justify-center">
                {state.qrCode ? (
                  <img
                    src={state.qrCode}
                    alt="WhatsApp QR Code"
                    className="w-64 h-64 sm:w-72 sm:h-72 object-contain"
                    id="whatsapp-qr-image"
                  />
                ) : (
                  <div className="w-64 h-64 flex flex-col items-center justify-center gap-3 text-neutral-700">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                    <span className="text-xs font-medium">Gerando imagem do QR...</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-neutral-400">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />
                <span>Atualiza automaticamente em tempo real</span>
              </div>
            </div>

            {/* Right: Instructions */}
            <div className="lg:col-span-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Escaneie o QR Code no seu celular
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Siga as instruções abaixo para vincular seu WhatsApp:
                </p>
              </div>

              <ol className="space-y-3 font-sans text-sm text-neutral-300">
                <li className="flex items-start gap-3 bg-neutral-800/50 p-2.5 rounded-lg border border-neutral-800">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold shrink-0">
                    1
                  </span>
                  <span>Abra o <strong>WhatsApp</strong> no seu celular</span>
                </li>

                <li className="flex items-start gap-3 bg-neutral-800/50 p-2.5 rounded-lg border border-neutral-800">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold shrink-0">
                    2
                  </span>
                  <span>
                    Toque em <strong>Configurações</strong> (ou <strong>Mais opções ⋮</strong> no Android)
                  </span>
                </li>

                <li className="flex items-start gap-3 bg-neutral-800/50 p-2.5 rounded-lg border border-neutral-800">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold shrink-0">
                    3
                  </span>
                  <span>
                    Toque em <strong>Aparelhos conectados</strong>
                  </span>
                </li>

                <li className="flex items-start gap-3 bg-neutral-800/50 p-2.5 rounded-lg border border-neutral-800">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold shrink-0">
                    4
                  </span>
                  <span>
                    Toque em <strong>Conectar aparelho</strong> e aponte a câmera para este QR Code
                  </span>
                </li>
              </ol>

              <div className="pt-2 flex items-center gap-3">
                <button
                  id="btn-cancel-connection"
                  onClick={onDisconnect}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition cursor-pointer"
                >
                  Cancelar Conexão
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STATE: AUTHENTICATED */}
        {state.status === 'authenticated' && (
          <div className="flex flex-col items-center text-center py-10 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ShieldCheck className="w-8 h-8 animate-bounce" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">QR Code Escaneado!</h3>
              <p className="text-sm text-neutral-400">
                Sincronizando sessão com o WhatsApp...
              </p>
            </div>
          </div>
        )}

        {/* STATE: CONNECTED */}
        {state.status === 'connected' && (
          <div className="space-y-6 py-2">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-emerald-300">
                    WhatsApp Conectado com Sucesso
                  </h3>
                  <p className="text-xs text-neutral-300">
                    Sessão ativa e sincronizada via Baileys
                  </p>
                </div>
              </div>

              <div className="hidden sm:block text-right">
                <span className="text-[11px] text-neutral-400 block font-mono">Status da Sessão</span>
                <span className="text-xs font-semibold text-emerald-400 font-mono">ONLINE</span>
              </div>
            </div>

            {/* Connected Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-neutral-800/60 border border-neutral-800 rounded-xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-neutral-400 text-xs font-medium">
                  <User className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Nome da Conta</span>
                </div>
                <div className="text-base font-bold text-white font-mono truncate" id="account-name-display">
                  {state.name || 'Conta WhatsApp'}
                </div>
              </div>

              <div className="bg-neutral-800/60 border border-neutral-800 rounded-xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-neutral-400 text-xs font-medium">
                  <Phone className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Número Conectado</span>
                </div>
                <div className="text-base font-bold text-emerald-400 font-mono" id="account-number-display">
                  {state.number ? `+${state.number}` : 'Número não identificado'}
                </div>
              </div>

              <div className="bg-neutral-800/60 border border-neutral-800 rounded-xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-neutral-400 text-xs font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Identificador JID</span>
                </div>
                <div className="text-xs font-mono text-neutral-300 truncate" title={state.jid || ''} id="account-jid-display">
                  {state.jid || 'N/A'}
                </div>
              </div>
            </div>

            {/* Disconnect Action */}
            <div className="pt-4 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-neutral-400">
                {state.connectedAt && (
                  <span>
                    Conectado em: <strong className="text-neutral-300">{new Date(state.connectedAt).toLocaleString('pt-BR')}</strong>
                  </span>
                )}
              </div>

              {!confirmDisconnect ? (
                <button
                  id="btn-disconnect-trigger"
                  onClick={() => setConfirmDisconnect(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  DESCONECTAR WHATSAPP
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-300 font-medium">Encerrar sessão?</span>
                  <button
                    id="btn-confirm-disconnect"
                    onClick={() => {
                      setConfirmDisconnect(false);
                      onDisconnect();
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
                  >
                    Sim, desconectar
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STATE: ERROR */}
        {state.status === 'error' && (
          <div className="flex flex-col items-center text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-base font-semibold text-white">Falha na Conexão</h3>
              <p className="text-sm text-rose-300">
                {state.error || 'Ocorreu um erro ao conectar ao WhatsApp.'}
              </p>
            </div>
            <button
              id="btn-retry-connect"
              onClick={onConnect}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-xs bg-emerald-500 hover:bg-emerald-400 text-black transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              TENTAR NOVAMENTE
            </button>
          </div>
        )}
      </div>

      {/* 
        Não mostramos o bloco "Etapas do Projeto North Code Zap"
        porque a aplicação já está consolidada.
      */}
    </div>
  );
}
