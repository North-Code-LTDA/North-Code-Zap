/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  Smartphone,
  MessageSquare,
  Zap,
  Layers,
  Settings,
  HelpCircle,
  Activity,
  Menu,
  X
} from 'lucide-react';
import { useWhatsApp } from './hooks/useWhatsApp';
import { NorthCodeLogo } from './components/NorthCodeLogo';
import { ConnectionCard } from './components/ConnectionCard';
import { DiagnosticLogs } from './components/DiagnosticLogs';

export default function App() {
  const { state, socketConnected, loading, logs, connect, disconnect } = useWhatsApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-black">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <NorthCodeLogo />
            <div className="hidden md:flex items-center gap-1 text-xs font-medium text-neutral-400">
              <span className="px-2.5 py-1 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300">
                v1.0.0-MVP
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Connection Pulse Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  state.status === 'connected'
                    ? 'bg-emerald-400 animate-pulse'
                    : state.status === 'qr'
                    ? 'bg-amber-400 animate-ping'
                    : state.status === 'connecting'
                    ? 'bg-blue-400 animate-pulse'
                    : 'bg-neutral-500'
                }`}
              />
              <span className="text-neutral-300 font-mono text-[11px]">
                {state.status === 'connected'
                  ? 'ONLINE'
                  : state.status === 'qr'
                  ? 'QR ATIVO'
                  : state.status === 'connecting'
                  ? 'CONECTANDO'
                  : 'OFFLINE'}
              </span>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400"
              aria-label="Abrir menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 gap-8">
        {/* Sidebar Navigation */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-64 bg-neutral-900/95 border-r border-neutral-800 p-6 flex flex-col justify-between transition-transform md:static md:translate-x-0 md:bg-transparent md:border-r-0 md:p-0 md:w-56 shrink-0 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="space-y-6">
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 font-mono">
              Navegação
            </div>

            <nav className="space-y-1.5" id="navigation-links">
              {/* Active Tab */}
              <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium text-sm">
                <Smartphone className="w-4 h-4" />
                <span>WhatsApp Conexão</span>
              </div>

              {/* Placeholder tabs for future steps */}
              <div
                title="Disponível na Etapa 4 & 5"
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-neutral-500 hover:text-neutral-400 text-sm cursor-not-allowed opacity-60"
              >
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4" />
                  <span>Mensagens</span>
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500">
                  Etapa 4
                </span>
              </div>

              <div
                title="Disponível na Etapa 6"
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-neutral-500 hover:text-neutral-400 text-sm cursor-not-allowed opacity-60"
              >
                <div className="flex items-center gap-3">
                  <Zap className="w-4 h-4" />
                  <span>Automações</span>
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500">
                  Etapa 6
                </span>
              </div>

              <div
                title="Disponível nas próximas fases"
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-neutral-500 hover:text-neutral-400 text-sm cursor-not-allowed opacity-60"
              >
                <div className="flex items-center gap-3">
                  <Layers className="w-4 h-4" />
                  <span>Fluxos</span>
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500">
                  Fase 2
                </span>
              </div>
            </nav>
          </div>

          <div className="pt-6 border-t border-neutral-800/80 space-y-3">
            <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs text-neutral-400 space-y-1">
              <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Modo Baileys Puro</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-tight">
                Conexão direta por WebSocket, sem Chromium headless.
              </p>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col space-y-6 max-w-4xl min-w-0">
          {/* Main WhatsApp Connection Card */}
          <ConnectionCard
            state={state}
            loading={loading}
            socketConnected={socketConnected}
            onConnect={connect}
            onDisconnect={disconnect}
          />

          {/* Diagnostic Real-time Logs Feed */}
          <DiagnosticLogs logs={logs} />
        </main>
      </div>
    </div>
  );
}
