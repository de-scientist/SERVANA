import { z } from 'zod';

export const updateRuleSchema = z.object({
  event: z.enum(['BOOKING', 'REVIEW', 'REFERRAL', 'PURCHASE', 'SIGNUP']),
  points: z.number().int().min(0).max(1_000_000),
  active: z.boolean().default(true),
});
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

export const updateTierSchema = z.object({
  threshold: z.number().int().min(0).max(100_000_000),
});
export type UpdateTierInput = z.infer<typeof updateTierSchema>;

export const redeemSchema = z.object({
  rewardId: z.string().uuid(),
});
export type RedeemInput = z.infer<typeof redeemSchema>;

export const createRewardSchema = z.object({
  name: z.string().min(2).max(200),
  cost: z.number().int().min(1).max(100_000_000),
  active: z.boolean().default(true),
});
export type CreateRewardInput = z.infer<typeof createRewardSchema>;

export const updateRewardSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  cost: z.number().int().min(1).max(100_000_000).optional(),
  active: z.boolean().optional(),
});
export type UpdateRewardInput = z.infer<typeof updateRewardSchema>;

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

// --- referrals ------------------------------------------------------------------

export const claimReferralSchema = z.object({
  code: z.string().min(3).max(32),
});
export type ClaimReferralInput = z.infer<typeof claimReferralSchema>;

// --- promotions -------------------------------------------------------------------

export const createPromotionSchema = z.object({
  code: z.string().min(3).max(32),
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  kind: z.enum(['PERCENTAGE', 'FIXED', 'FREE_SHIP']),
  // PERCENTAGE: basis points (1000 = 10%). FIXED: major units (KES).
  value: z.number().positive().max(100_000_000),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().nullable().optional(),
  scope: z.enum(['GLOBAL', 'PRODUCT', 'CATEGORY', 'PROVIDER', 'SERVICE']).default('GLOBAL'),
  scopeId: z.string().uuid().nullable().optional(),
  minOrder: z.number().min(0).max(100_000_000).default(0),
  maxDiscount: z.number().positive().max(100_000_000).nullable().optional(),
  usageLimit: z.number().int().positive().max(10_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(100).default(1),
  active: z.boolean().default(true),
});
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export const updatePromotionSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  maxDiscount: z.number().positive().max(100_000_000).nullable().optional(),
  usageLimit: z.number().int().positive().max(10_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(100).optional(),
  active: z.boolean().optional(),
});
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

export const validatePromotionSchema = z.object({
  code: z.string().min(3).max(32),
});
export type ValidatePromotionInput = z.infer<typeof validatePromotionSchema>;
