import {
  Users,
  Zap,
  Layers,
  Send,
  Bot,
  Settings,
  Clock,
  Sparkles,
  type LucideIcon
} from 'lucide-react';
import type { NavigationTab } from '../types';

interface PlaceholderViewProps {
  tab: NavigationTab;
  onNavigateToWhatsApp?: () => void;
}

const TAB_CONFIG: Record<
  string,
  {
    title: string;
    description: string;
    icon: LucideIcon;
    statusLabel: string;
    features: string[];
  }
> = {
  contatos: {
    title: 'Gerenciamento de Contatos',
    description: 'Gerencie em uma interface dedicada os contatos já reconhecidos e persistidos pela plataforma.',
    icon: Users,
    statusLabel: 'Interface em desenvolvimento',
    features: [
      'Sincronização automática de contatos recebidos',
      'Etiquetas personalizadas e filtros avançados',
      'Exportação e importação de listas CSV',
      'Histórico individual de atendimentos',
    ],
  },
  automacoes: {
    title: 'Automações & Gatilhos',
    description: 'Crie regras inteligentes para disparo automático de mensagens baseadas em eventos.',
    icon: Zap,
    statusLabel: 'Módulo em desenvolvimento',
    features: [
      'Respostas automáticas por palavras-chave',
      'Gatilhos de boas-vindas e ausência',
      'Encaminhamento automático para operadores',
      'Disparo condicional via Webhooks',
    ],
  },
  fluxos: {
    title: 'Editor Visual de Fluxos',
    description: 'Construa árvores de decisão e chatbots interativos arrastando blocos no canvas.',
    icon: Layers,
    statusLabel: 'Módulo em desenvolvimento',
    features: [
      'Editor visual de nós e conexões',
      'Menus com botões e listas interativas',
      'Coleta de variáveis e validação de dados',
      'Integração com APIs externas',
    ],
  },
  campanhas: {
    title: 'Campanhas de Transmissão',
    description: 'Organize ações de comunicação reutilizando destinatários, personalização, mídia, agendamento e relatórios já existentes na plataforma.',
    icon: Send,
    statusLabel: 'Interface dedicada em desenvolvimento',
    features: [
      'Organização de campanhas',
      'Segmentação avançada de destinatários',
      'Histórico e relatórios globais',
      'Opt-out e listas de exclusão',
    ],
  },
  ia: {
    title: 'Agentes de Inteligência Artificial',
    description: 'Conecte modelos de IA generativa para responder clientes de forma humanizada e inteligente.',
    icon: Bot,
    statusLabel: 'Módulo em desenvolvimento',
    features: [
      'Assistente treinado com a base de conhecimento da empresa',
      'Compreensão de linguagem natural em áudio e texto',
      'Transbordo inteligente para atendimento humano',
      'Análise de sentimento e intenção de compra',
    ],
  },
  configuracoes: {
    title: 'Configurações do Sistema',
    description: 'Gerencie parâmetros de conexão, servidores, webhooks e credenciais de segurança.',
    icon: Settings,
    statusLabel: 'Interface em desenvolvimento',
    features: [
      'Portas de rede e status do servidor Express',
      'Caminhos de persistência da sessão Baileys',
      'URLs de Webhook para eventos externos',
      'Parâmetros de Socket.IO e timeout',
    ],
  },
};

export function PlaceholderView({ tab }: PlaceholderViewProps) {
  const config = TAB_CONFIG[tab] || {
    title: 'Módulo em Desenvolvimento',
    description: 'Esta área estará disponível nas próximas atualizações da plataforma.',
    icon: Sparkles,
    statusLabel: 'Em desenvolvimento',
    features: ['Funcionalidade em construção'],
  };

  const IconComponent = config.icon;

  return (
    <div className="space-y-6" id={`view-${tab}`}>
      {/* Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-emerald-400">
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">{config.title}</h1>
              <p className="text-xs text-neutral-400">{config.description}</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-neutral-800 text-neutral-400 border border-neutral-700">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            {config.statusLabel}
          </span>
        </div>
      </div>

      {/* Roadmap Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-300 font-mono">
            Recursos Planejados para este Módulo
          </h2>
          <p className="text-xs text-neutral-400">
            Esta funcionalidade está em construção e estará disponível em breve.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {config.features.map((feature, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-neutral-800/50 border border-neutral-800 flex items-start gap-3"
            >
              <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <span className="text-xs text-neutral-300 leading-relaxed">{feature}</span>
            </div>
          ))}
        </div>

        <div className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs text-neutral-400 flex items-center justify-between">
          <span>
            Módulos ativos no momento: <strong className="text-emerald-400 font-mono">Dashboard</strong>, <strong className="text-emerald-400 font-mono">WhatsApp</strong>, <strong className="text-emerald-400 font-mono">Conversas</strong> e <strong className="text-emerald-400 font-mono">Agendamentos</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
