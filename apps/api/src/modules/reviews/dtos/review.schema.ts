import { z } from 'zod';

export const REVIEW_DIMENSIONS = [
  'Quality',
  'Professionalism',
  'Communication',
  'Punctuality',
  'Value',
] as const;

export const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  overall: z.number().int().min(1).max(5),
  title: z.string().min(3).max(200).optional(),
  body: z.string().min(10).max(5000).optional(),
  dimensions: z
    .array(
      z.object({
        name: z.enum(REVIEW_DIMENSIONS),
        score: z.number().int().min(1).max(5),
      }),
    )
    .min(5)
    .max(5),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const respondReviewSchema = z.object({
  body: z.string().min(5).max(2000),
});

export type RespondReviewInput = z.infer<typeof respondReviewSchema>;

export const moderateReviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REMOVE']),
  notes: z.string().max(1000).optional(),
});

export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

export const listReviewsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['APPROVED', 'PENDING', 'REJECTED', 'REMOVED']).optional(),
});

export type ListReviewsInput = z.infer<typeof listReviewsSchema>;

export const rankingWeightsSchema = z.object({
  customerRating: z.number().min(0).max(1).default(0.3),
  completedJobs: z.number().min(0).max(1).default(0.2),
  repeatRate: z.number().min(0).max(1).default(0.15),
  cancellationRate: z.number().min(0).max(1).default(0.1),
  responseRate: z.number().min(0).max(1).default(0.1),
  onTimeRate: z.number().min(0).max(1).default(0.1),
  verificationProfile: z.number().min(0).max(1).default(0.05),
});

export type RankingWeights = z.infer<typeof rankingWeightsSchema>;
