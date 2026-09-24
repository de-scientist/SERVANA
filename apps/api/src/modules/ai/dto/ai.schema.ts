import { z } from 'zod';

export const completeSchema = z.object({
  feature: z.string().min(2).max(80),
  input: z.string().trim().min(1).max(8000),
  context: z.record(z.string(), z.unknown()).optional(),
});
export type CompleteInput = z.infer<typeof completeSchema>;

export const recommendProvidersSchema = z.object({
  serviceId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  city: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type RecommendProvidersInput = z.infer<typeof recommendProvidersSchema>;

export const recommendServicesSchema = z.object({
  categoryId: z.string().uuid().optional(),
  city: z.string().max(120).optional(),
  maxPrice: z.coerce.number().positive().max(100_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type RecommendServicesInput = z.infer<typeof recommendServicesSchema>;

export const recommendProductsSchema = z.object({
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type RecommendProductsInput = z.infer<typeof recommendProductsSchema>;

export const matchSchema = z.object({
  query: z.string().trim().min(3).max(500),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type MatchInput = z.infer<typeof matchSchema>;

export const explainSchema = z.object({
  itemType: z.enum(['provider', 'service', 'product']),
  itemId: z.string().uuid(),
});
export type ExplainInput = z.infer<typeof explainSchema>;

export const marketingDraftSchema = z.object({
  topic: z.string().trim().min(3).max(300),
  tone: z.enum(['Professional', 'Friendly', 'Luxury', 'Playful', 'Minimal']).default('Friendly'),
});
export type MarketingDraftInput = z.infer<typeof marketingDraftSchema>;

export const reviewInsightsSchema = z.object({
  providerId: z.string().uuid(),
});
export type ReviewInsightsInput = z.infer<typeof reviewInsightsSchema>;

export const moderateSchema = z.object({
  text: z.string().trim().min(1).max(8000),
});
export type ModerateInput = z.infer<typeof moderateSchema>;

export const proposeActionSchema = z.object({
  kind: z.string().min(2).max(60),
  payload: z.record(z.string(), z.unknown()),
  reason: z.string().max(1000).optional(),
});
export type ProposeActionInput = z.infer<typeof proposeActionSchema>;

export const reviewProposalSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(1000).optional(),
});
export type ReviewProposalInput = z.infer<typeof reviewProposalSchema>;

export const usageQuerySchema = z.object({
  feature: z.string().max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type UsageQuery = z.infer<typeof usageQuerySchema>;
