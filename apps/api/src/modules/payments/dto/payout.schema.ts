import { z } from 'zod';

export const createPayoutSchema = z.object({
  providerId: z.string().min(1),
  methodId: z.string().min(1),
  earningIds: z.array(z.string().min(1)).min(1).max(200),
  currency: z.string().default('KES'),
});
export type CreatePayoutInputDto = z.infer<typeof createPayoutSchema>;

export const processPayoutSchema = z.object({
  payoutId: z.string().uuid(),
  reference: z.string().optional(),
});
export type ProcessPayoutInputDto = z.infer<typeof processPayoutSchema>;

export const retryPayoutSchema = z.object({
  payoutId: z.string().uuid(),
});
export type RetryPayoutInputDto = z.infer<typeof retryPayoutSchema>;

export const payoutAdjustmentSchema = z.object({
  payoutId: z.string().uuid(),
  amountCents: z.string(),
  reason: z.string().max(500),
});
export type PayoutAdjustmentInputDto = z.infer<typeof payoutAdjustmentSchema>;

export const reconciliationQuerySchema = z.object({
  providerId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REVERSED']).optional(),
});
export type ReconciliationQueryDto = z.infer<typeof reconciliationQuerySchema>;
