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

export interface WhatsAppInstance {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppInstanceSummary extends WhatsAppInstance {
  account: WhatsAppAccountInfo;
}

export interface ScheduledTarget {
  type: 'person' | 'group';
  jid: string;
  label: string;
  name?: string;
  source: 'directory' | 'manual' | 'import' | 'group_member' | 'group';
}

export interface KnownContact {
  jid: string;
  number: string | null;
  name: string | null;
  source: 'message' | 'contact' | 'chat';
  lastSeenAt?: string | null;
}

export interface GroupParticipant {
  jid: string;
  number: string | null;
  name: string | null;
  selectable: boolean;
  isAdmin?: boolean;
}

export interface GroupParticipantsResponse {
  groupJid: string;
  groupName: string;
  participants: GroupParticipant[];
}

export interface DeliveryOptions {
  intervalBetweenMessagesMs: number; // e.g. 5000 ms
  batchPauseEnabled: boolean;
  batchSize: number; // e.g. 3
  batchPauseMs: number; // e.g. 300000 ms (5 min)
}

export interface ScheduleExecutionDetail {
  targetJid: string;
  targetLabel: string;
  status: 'sent' | 'failed' | 'skipped';
  messageId?: string;
  sentAt?: string;
  renderedPreview?: string;
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

export interface WeeklyTimeSlot {
  day: number; // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  times: string[]; // ["08:00", "14:00"]
}

export interface ScheduledMedia {
  type: 'image';
  source: 'upload' | 'url';
  localPath?: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
}

export interface SchedulePayload {
  name: string;
  message: string;
  targets: ScheduledTarget[];
  scheduleType: ScheduleType;
  scheduledAt: string | null;
  dailyTimes: string[];
  weeklyTimeSlots: WeeklyTimeSlot[];
  media: ScheduledMedia | null;
  fallbackName: string;
  deliveryOptions: DeliveryOptions;
}

export interface ScheduledMessage {
  id: string;
  instanceId: string;
  name: string;
  message: string;
  targets: ScheduledTarget[];
  scheduleType: ScheduleType;
  scheduledAt: string | null; // ISO string e.g. "2026-08-17T08:00"
  nextRunAt: string | null; // ISO string or null
  dailyTimes: string[]; // ["08:00", "12:00", "18:00"]
  weeklyTimeSlots: WeeklyTimeSlot[];
  media: ScheduledMedia | null;
  fallbackName: string; // "amigo(a)"
  deliveryOptions: DeliveryOptions;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastResult: ScheduleLastResult | null;
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
  instanceId: string;
  scheduleName: string;
  currentIndex: number;
  totalTargets: number;
  targetLabel: string;
  targetJid: string;
  status: 'sending' | 'sent' | 'failed' | 'batch_pause';
  phase?: 'sending' | 'batch_pause';
  resumeAt?: string | null;
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
  | 'configuracoes'
  | 'templates';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
}

export interface AuthIdentity {
  user: AuthUser;
  workspace: AuthWorkspace;
}

export interface AudienceTag {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AudienceList {
  id: string;
  name: string;
  contactJids: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AudiencesState {
  tags: AudienceTag[];
  contactTags: Record<string, string[]>;
  lists: AudienceList[];
}

export interface CampaignScheduleConfig {
  scheduleType: ScheduleType;
  scheduledAt: string | null;
  dailyTimes: string[];
  weeklyTimeSlots: WeeklyTimeSlot[];
  deliveryOptions: DeliveryOptions;
}

export interface CampaignAudienceSnapshot {
  listId: string;
  listName: string;
  targetCount: number;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  instanceId: string;

  name: string;

  audienceListId: string | null;
  audienceSnapshot: CampaignAudienceSnapshot | null;

  message: string;
  fallbackName: string;
  media: ScheduledMedia | null;

  schedule: CampaignScheduleConfig;

  scheduleId: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface CampaignExecutionHistory {
  id: string;
  workspaceId: string;
  instanceId: string;
  campaignId: string;
  scheduleId: string;
  scheduleName: string;
  executedAt: string;
  totalTargets: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  details: ScheduleExecutionDetail[];
}

export interface CampaignExecutionSummary {
  id: string;
  campaignId: string;
  scheduleId: string;
  scheduleName: string;
  executedAt: string;
  totalTargets: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
}

export type AutomationTrigger =
  | {
      type: 'contact_added_to_list';
      listId: string;
    }
  | {
      type: 'tag_added_to_contact';
      tagId: string;
    };

export interface Automation {
  id: string;
  workspaceId: string;
  instanceId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  message: string;
  fallbackName: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  workspaceId: string;
  name: string;
  message: string;
  fallbackName: string;
  createdAt: string;
  updatedAt: string;
}
