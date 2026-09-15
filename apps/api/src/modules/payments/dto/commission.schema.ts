import { z } from 'zod';

export const createCommissionRuleSchema = z.object({
  scope: z.string().min(1).max(100),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.number().min(0),
  priority: z.number().int().min(0).max(100).optional(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().nullable().optional(),
});
export type CreateCommissionRuleDto = z.infer<typeof createCommissionRuleSchema>;

export const updateCommissionRuleSchema = z.object({
  type: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  value: z.number().min(0).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  validTo: z.string().datetime().nullable().optional(),
});
export type UpdateCommissionRuleDto = z.infer<typeof updateCommissionRuleSchema>;
