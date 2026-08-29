import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  bookingId: z.string().uuid(),
  method: z.enum(['MPESA', 'CARD', 'BANK', 'OTHER']).optional(),
});
export type InitiatePaymentInputDto = z.infer<typeof initiatePaymentSchema>;

export const refundPaymentSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RefundPaymentInputDto = z.infer<typeof refundPaymentSchema>;

export const webhookEventSchema = z.object({
  providerRef: z.string(),
  status: z.enum(['PENDING', 'SUCCESSFUL', 'FAILED']),
  amount: z.number(),
  currency: z.string(),
  transactionId: z.string().optional(),
});
export type WebhookEventDto = z.infer<typeof webhookEventSchema>;
