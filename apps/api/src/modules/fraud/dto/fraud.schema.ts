import { z } from 'zod';

export const scanQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  minScore: z.coerce.number().int().min(0).max(100).default(40),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(120).optional(),
});
export type ScanQuery = z.infer<typeof scanQuerySchema>;

export const alertsQuerySchema = z.object({
  status: z.enum(['OPEN', 'REVIEWED', 'FALSE_POSITIVE', 'ACTIONED']).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type AlertsQuery = z.infer<typeof alertsQuerySchema>;

export const reviewAlertSchema = z.object({
  status: z.enum(['REVIEWED', 'FALSE_POSITIVE', 'ACTIONED']),
  note: z.string().max(1000).optional(),
});
export type ReviewAlertInput = z.infer<typeof reviewAlertSchema>;
