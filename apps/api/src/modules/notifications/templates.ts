/**
 * Default notification copy. The ONLY place customer-facing notification text
 * lives — business logic references events, never strings. Seeded
 * no-clobber: admins can edit templates without deploys overwriting them.
 *
 * Placeholders use {{name}} and are filled from the event data payload.
 */
export interface TemplateDef {
  key: string;
  event: string;
  channel: 'INAPP' | 'EMAIL' | 'SMS' | 'PUSH' | 'WHATSAPP';
  subject?: string;
  body: string;
}

export const DEFAULT_TEMPLATES: TemplateDef[] = [
  {
    key: 'BOOKING_CREATED:INAPP',
    event: 'BOOKING_CREATED',
    channel: 'INAPP',
    body: 'Your booking {{reference}} for {{serviceName}} on {{startsAt}} was received. We will confirm payment shortly.',
  },
  {
    key: 'BOOKING_CREATED:EMAIL',
    event: 'BOOKING_CREATED',
    channel: 'EMAIL',
    subject: 'Booking received — {{reference}}',
    body: 'Hi {{customerName}}, your booking {{reference}} for {{serviceName}} on {{startsAt}} was received. Amount: {{amount}}.',
  },
  {
    key: 'BOOKING_CONFIRMED:INAPP',
    event: 'BOOKING_CONFIRMED',
    channel: 'INAPP',
    body: 'Booking {{reference}} is confirmed for {{startsAt}}. See you soon!',
  },
  {
    key: 'BOOKING_CONFIRMED:EMAIL',
    event: 'BOOKING_CONFIRMED',
    channel: 'EMAIL',
    subject: 'Booking confirmed — {{reference}}',
    body: 'Hi {{customerName}}, booking {{reference}} is confirmed for {{startsAt}} with {{providerName}}.',
  },
  {
    key: 'BOOKING_REMINDER:INAPP',
    event: 'BOOKING_REMINDER',
    channel: 'INAPP',
    body: 'Reminder: your appointment {{reference}} is tomorrow at {{startsAt}}.',
  },
  {
    key: 'BOOKING_REMINDER:EMAIL',
    event: 'BOOKING_REMINDER',
    channel: 'EMAIL',
    subject: 'Reminder: appointment tomorrow — {{reference}}',
    body: 'Hi {{customerName}}, a friendly reminder that {{serviceName}} with {{providerName}} is tomorrow at {{startsAt}}.',
  },
  {
    key: 'BOOKING_REMINDER:SMS',
    event: 'BOOKING_REMINDER',
    channel: 'SMS',
    body: 'SERVANA reminder: {{serviceName}} tomorrow at {{startsAt}} ({{reference}}).',
  },
  {
    key: 'PAYMENT_SUCCESSFUL:INAPP',
    event: 'PAYMENT_SUCCESSFUL',
    channel: 'INAPP',
    body: 'Payment of {{amount}} for booking {{reference}} succeeded.',
  },
  {
    key: 'PAYMENT_SUCCESSFUL:EMAIL',
    event: 'PAYMENT_SUCCESSFUL',
    channel: 'EMAIL',
    subject: 'Payment received — {{reference}}',
    body: 'Hi {{customerName}}, we received {{amount}} for booking {{reference}}. Thank you!',
  },
  {
    key: 'PAYMENT_FAILED:INAPP',
    event: 'PAYMENT_FAILED',
    channel: 'INAPP',
    body: 'Payment for booking {{reference}} failed ({{reason}}). Please try again — your booking is held.',
  },
  {
    key: 'PAYMENT_FAILED:EMAIL',
    event: 'PAYMENT_FAILED',
    channel: 'EMAIL',
    subject: 'Payment failed — {{reference}}',
    body: 'Hi {{customerName}}, your payment of {{amount}} for booking {{reference}} failed ({{reason}}). No money left your account. Please retry from your bookings page.',
  },
  {
    key: 'PAYMENT_FAILED:SMS',
    event: 'PAYMENT_FAILED',
    channel: 'SMS',
    body: 'SERVANA: payment for {{reference}} failed. Please retry — no money was taken.',
  },
  {
    key: 'SERVICE_COMPLETED:INAPP',
    event: 'SERVICE_COMPLETED',
    channel: 'INAPP',
    body: 'Your service {{reference}} is marked complete. How was it? Your review helps {{providerName}} grow.',
  },
  {
    key: 'SERVICE_COMPLETED:EMAIL',
    event: 'SERVICE_COMPLETED',
    channel: 'EMAIL',
    subject: 'Service completed — {{reference}}',
    body: 'Hi {{customerName}}, {{serviceName}} on {{startsAt}} is marked complete. Enjoy the rest of your day!',
  },
  {
    key: 'REVIEW_REQUEST:INAPP',
    event: 'REVIEW_REQUEST',
    channel: 'INAPP',
    body: 'Please rate your recent {{serviceName}} experience with {{providerName}} (booking {{reference}}).',
  },
  {
    key: 'REVIEW_REQUEST:EMAIL',
    event: 'REVIEW_REQUEST',
    channel: 'EMAIL',
    subject: 'How was {{serviceName}}? — {{reference}}',
    body: 'Hi {{customerName}}, please take a minute to review {{providerName}} for booking {{reference}}. Verified reviews keep the marketplace trustworthy.',
  },
  {
    key: 'PAYOUT_COMPLETED:INAPP',
    event: 'PAYOUT_COMPLETED',
    channel: 'INAPP',
    body: 'Payout {{reference}} of {{amount}} completed to your {{method}}.',
  },
  {
    key: 'PAYOUT_COMPLETED:EMAIL',
    event: 'PAYOUT_COMPLETED',
    channel: 'EMAIL',
    subject: 'Payout completed — {{reference}}',
    body: 'Hi {{providerName}}, your payout {{reference}} of {{amount}} was sent to your {{method}}. It should reflect shortly.',
  },
  {
    key: 'REWARD_EARNED:INAPP',
    event: 'REWARD_EARNED',
    channel: 'INAPP',
    body: 'You earned {{points}} loyalty points ({{reason}}). Balance: {{balance}}.',
  },
  {
    key: 'REWARD_EARNED:EMAIL',
    event: 'REWARD_EARNED',
    channel: 'EMAIL',
    subject: 'You earned {{points}} points!',
    body: 'Hi {{customerName}}, you earned {{points}} loyalty points ({{reason}}). Your balance is {{balance}} — redeem rewards any time.',
  },
  {
    key: 'PROMOTION:INAPP',
    event: 'PROMOTION',
    channel: 'INAPP',
    body: 'You saved {{discount}} with {{promoCode}} on order {{orderId}}. Enjoy!',
  },
  {
    key: 'PROMOTION:EMAIL',
    event: 'PROMOTION',
    channel: 'EMAIL',
    subject: 'Discount applied — {{promoCode}}',
    body: 'Hi {{customerName}}, {{promoCode}} saved you {{discount}} on your order. Thank you for shopping with SERVANA!',
  },
];
