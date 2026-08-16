export type WhatsAppStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'authenticated'
  | 'connected'
  | 'error';

export interface WhatsAppAccountInfo {
  name: string | null;
  number: string | null;
  jid: string | null;
  status: WhatsAppStatus;
  qrCode: string | null;
  error?: string | null;
  connectedAt?: string | null;
}

export interface ReceivedMessage {
  id: string;
  remoteJid: string;
  number: string | null;
  pushName: string | null;
  text: string;
  type: string;
  timestamp: number;
  direction?: 'incoming' | 'outgoing';
}

export type ChatMessage = ReceivedMessage;

export type NavigationTab =
  | 'dashboard'
  | 'whatsapp'
  | 'conversas'
  | 'contatos'
  | 'automacoes'
  | 'fluxos'
  | 'campanhas'
  | 'agendamentos'
  | 'ia'
  | 'configuracoes';
