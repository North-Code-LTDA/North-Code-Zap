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

export type ScheduleType = 'once' | 'daily' | 'weekly';

export type ScheduleStatus =
  | 'active'
  | 'paused'
  | 'running'
  | 'completed'
  | 'error';

export interface ScheduledTarget {
  type: 'person' | 'group';
  jid: string;
  label: string;
}

export interface ScheduleExecutionDetail {
  targetJid: string;
  targetLabel: string;
  status: 'sent' | 'failed' | 'skipped';
  messageId?: string;
  sentAt?: string;
  error?: string;
}

export interface ScheduleLastResult {
  totalTargets: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  executedAt: string;
  details: ScheduleExecutionDetail[];
}

export interface ScheduledMessage {
  id: string;
  name: string;
  message: string;
  targets: ScheduledTarget[];
  scheduleType: ScheduleType;
  scheduledAt: string; // ISO string e.g. "2026-08-17T08:00"
  nextRunAt: string | null; // ISO string or null
  weeklyDays?: number[]; // [0,1,2,3,4,5,6]
  timeOfDay?: string; // "08:00"
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string | null;
  lastResult?: ScheduleLastResult | null;
}

export interface WhatsAppGroup {
  id: string;
  subject: string;
  participantsCount: number;
  creation?: number;
  owner?: string;
}

export interface SchedulerProgressEvent {
  scheduleId: string;
  scheduleName: string;
  currentIndex: number;
  totalTargets: number;
  targetLabel: string;
  targetJid: string;
  status: 'sending' | 'sent' | 'failed';
  sentCount: number;
  failedCount: number;
}

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
