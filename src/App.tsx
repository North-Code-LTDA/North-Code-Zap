/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Users,
  Zap,
  Layers,
  Send,
  Calendar,
  Bot,
  Settings,
  Menu,
  X,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import { useWhatsApp } from './hooks/useWhatsApp';
import { InstancesProvider, useInstances } from './contexts/InstancesContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthView } from './components/AuthView';
import { LogOut } from 'lucide-react';
import { FileText } from 'lucide-react';
import { InstancesSelector } from './components/InstancesSelector';
import { NorthCodeLogo } from './components/NorthCodeLogo';
import { ConnectionCard } from './components/ConnectionCard';
import { DiagnosticLogs } from './components/DiagnosticLogs';
import { DashboardView } from './components/DashboardView';
import { ConversasView } from './components/ConversasView';
import { AgendamentosView } from './components/AgendamentosView';
import { CampanhasView } from './components/CampanhasView';
import { ContatosView } from './components/ContatosView';
import { TemplatesView } from './components/TemplatesView';
import { PlaceholderView } from './components/PlaceholderView';
import type { NavigationTab } from './types';

function AppContent() {
  const { identity, logout } = useAuth();
  const { selectedInstanceId } = useInstances();
  const { state, messages, messagesCount, socketConnected, loading, logs, connect, disconnect, sendMessage } = useWhatsApp(selectedInstanceId);
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{
    id: NavigationTab;
    label: string;
    icon: LucideIcon;
    badge?: number | string;
    isReal?: boolean;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, isReal: true },
    { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone, isReal: true },
    { id: 'conversas', label: 'Conversas', icon: MessageSquare, badge: messagesCount > 0 ? messagesCount : undefined, isReal: true },
    { id: 'agendamentos', label: 'Agendamentos', icon: Calendar, isReal: true },
    { id: 'contatos', label: 'Contatos', icon: Users, isReal: true },
    { id: 'templates', label: 'Templates', icon: FileText, isReal: true },
    { id: 'automacoes', label: 'Automações', icon: Zap },
    { id: 'fluxos', label: 'Fluxos', icon: Layers },
    { id: 'campanhas', label: 'Campanhas', icon: Send },
    { id: 'ia', label: 'IA', icon: Bot },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-black">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setCurrentTab('dashboard')}
              className="focus:outline-none cursor-pointer text-left"
            >
              <NorthCodeLogo />
            </button>
            <div className="hidden md:flex items-center gap-1 text-xs font-medium text-neutral-400">
              <span className="px-2.5 py-1 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300">
                v1.7.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <InstancesSelector />
            </div>
            {/* Live Socket & Connection Pulse Indicator */}
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
                {!selectedInstanceId
                  ? 'SEM INSTÂNCIA'
                  : state.status === 'connected'
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
          <div className="space-y-4">
            <div className="sm:hidden mb-4">
              <InstancesSelector />
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 font-mono">
              Plataforma
            </div>

            <nav className="space-y-1" id="navigation-links">
              {navItems.map((item) => {
                const IconComponent = item.icon;
                const isActive = currentTab === item.id;

                return (
                  <button
                    key={item.id}
                    id={`nav-item-${item.id}`}
                    onClick={() => {
                      setCurrentTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer text-left ${
                      isActive
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-900/80 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <IconComponent className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-neutral-400'}`} />
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="pt-6 border-t border-neutral-800/80 space-y-3">
            <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs text-neutral-400 space-y-1">
              <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                <span>Socket.IO Realtime</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-tight">
                {socketConnected ? 'Sincronização ativa' : 'Conectando ao servidor...'}
              </p>
            </div>
            
            <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-400 flex flex-col gap-2">
              <div className="truncate">
                <div className="font-semibold text-neutral-200 truncate">{identity?.user?.name}</div>
                <div className="text-[10px] text-neutral-500 truncate">{identity?.user?.email}</div>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-700/50 bg-neutral-800/50 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
              >
                <LogOut className="w-3 h-3" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {!selectedInstanceId && currentTab !== 'templates' ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 border border-neutral-800 border-dashed rounded-2xl bg-neutral-900/20">
              <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 mb-6 shadow-sm">
                <LayoutDashboard className="w-8 h-8 text-neutral-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2 tracking-tight">Nenhuma instância configurada</h2>
              <p className="text-sm text-neutral-400 mb-8 max-w-sm">
                Crie uma instância para começar a gerenciar seus envios e atendimentos.
              </p>
              <InstancesSelector />
            </div>
          ) : (
            <>
          {/* TAB 1: DASHBOARD */}
          {currentTab === 'dashboard' && (
            <DashboardView
              state={state}
              messages={messages}
              messagesCount={messagesCount}
              onNavigate={setCurrentTab}
            />
          )}

          {/* TAB 2: WHATSAPP (CONNECTION & DIAGNOSTICS) */}
          {currentTab === 'whatsapp' && (
            <div className="space-y-6">
              <ConnectionCard
                state={state}
                loading={loading}
                socketConnected={socketConnected}
                onConnect={connect}
                onDisconnect={disconnect}
              />
              <DiagnosticLogs logs={logs} />
            </div>
          )}

          {/* TAB 3: CONVERSAS (RECEBIMENTO E ENVIO EM TEMPO REAL) */}
          {currentTab === 'conversas' && (
            <ConversasView
              messages={messages}
              state={state}
              socketConnected={socketConnected}
              onSendMessage={sendMessage}
            />
          )}

          {/* TAB 4: AGENDAMENTOS (ENVIO AUTOMÁTICO PARA PESSOAS E GRUPOS) */}
          {currentTab === 'agendamentos' && (
            <AgendamentosView
              whatsappState={state}
            />
          )}

          {/* TAB 5: CONTATOS (DIRETÓRIO) */}
          {currentTab === 'contatos' && (
            <ContatosView />
          )}

          {/* TAB 6: TEMPLATES */}
          {currentTab === 'templates' && (
            <TemplatesView />
          )}

          {/* TAB 7: CAMPANHAS */}
          {currentTab === 'campanhas' && (
            <CampanhasView selectedInstanceId={selectedInstanceId} />
          )}

          {/* OTHER PLACEHOLDER TABS */}
          {currentTab !== 'dashboard' &&
            currentTab !== 'whatsapp' &&
            currentTab !== 'conversas' &&
            currentTab !== 'agendamentos' &&
            currentTab !== 'contatos' &&
            currentTab !== 'templates' &&
            currentTab !== 'campanhas' && (
              <PlaceholderView tab={currentTab} />
            )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}


function AppRoot() {
  const { identity, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="text-neutral-400 font-medium tracking-wide">Carregando...</div>
      </div>
    );
  }

  if (!identity) {
    return <AuthView />;
  }

  return (
    <InstancesProvider>
      <AppContent />
    </InstancesProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  );
}
