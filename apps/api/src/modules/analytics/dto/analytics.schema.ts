import { z } from 'zod';

export const TRACKED_EVENTS = [
  'USER_REGISTERED',
  'SEARCH_PERFORMED',
  'SERVICE_VIEWED',
  'PROVIDER_VIEWED',
  'BOOKING_STARTED',
  'BOOKING_CREATED',
  'BOOKING_COMPLETED',
  'PAYMENT_SUCCESSFUL',
  'PRODUCT_VIEWED',
  'PRODUCT_PURCHASED',
  'REVIEW_CREATED',
  'POINTS_EARNED',
  'POINTS_REDEEMED',
] as const;

export const rangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

export const eventsQuerySchema = z.object({
  type: z.string().min(2).max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type EventsQuery = z.infer<typeof eventsQuerySchema>;

export const trackAttributionSchema = z.object({
  sessionId: z.string().max(120).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(200).optional(),
  utmContent: z.string().max(200).optional(),
  referralCode: z.string().max(32).optional(),
  providerSlug: z.string().max(200).optional(),
});
export type TrackAttributionInput = z.infer<typeof trackAttributionSchema>;
