export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH' | 'WHATSAPP' | 'INAPP';

export interface NotificationMessage {
  channel: NotificationChannel;
  to: string;
  subject?: string;
  body: string;
  templateKey?: string;
  userId?: string;
}

export interface NotificationResult {
  delivered: boolean;
  providerRef?: string;
}

/**
 * Channel-agnostic notification contract. Real providers (email/SMS/whatsapp
 * gateways) implement this interface; the platform never calls a vendor SDK directly.
 */
export interface NotificationProvider {
  readonly id: string;
  send(msg: NotificationMessage): Promise<NotificationResult>;
}
