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
