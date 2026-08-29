import { z } from 'zod';

export const DELIVERY_TYPES = [
  'AT_PROVIDER_LOCATION',
  'AT_CUSTOMER_LOCATION',
  'REMOTE',
  'EITHER',
] as const;

export const VERIFICATION_LEVELS = [
  'BASIC',
  'PHONE_VERIFIED',
  'IDENTITY_VERIFIED',
  'PROFESSIONAL_VERIFIED',
  'BUSINESS_VERIFIED',
  'TRUSTED_PROVIDER',
] as const;

const imageSchema = z.object({
  key: z.string().min(1).max(512),
  url: z.string().min(1).max(1024),
});

// ---------------------------------------------------------------------------
// Provider profile
// ---------------------------------------------------------------------------

export const createProviderProfileSchema = z.object({
  businessName: z.string().min(2).max(120),
  tagline: z.string().max(160).optional(),
  bio: z.string().max(4000).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  address: z.record(z.unknown()).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  serviceRadiusKm: z.number().positive().max(500).nullable().optional(),
  travelToCustomer: z.boolean().optional(),
  websiteUrl: z.string().url().max(400).nullable().optional(),
  businessPhone: z.string().max(30).nullable().optional(),
  yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  languages: z.array(z.string().min(1).max(60)).max(20).optional(),
  socialLinks: z.record(z.unknown()).nullable().optional(),
  workingPreferences: z.record(z.unknown()).nullable().optional(),
});

export const updateProviderProfileSchema = createProviderProfileSchema.partial();

export type CreateProviderProfileInput = z.infer<typeof createProviderProfileSchema>;
export type UpdateProviderProfileInput = z.infer<typeof updateProviderProfileSchema>;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const setProviderCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1).max(20),
});

export type SetProviderCategoriesInput = z.infer<typeof setProviderCategoriesSchema>;

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export const createProviderServiceSchema = z.object({
  serviceId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  name: z.string().min(2).max(160),
  description: z.string().max(4000).optional(),
  price: z.number().positive().max(10_000_000),
  currency: z.string().length(3).default('KES'),
  durationMin: z.number().int().min(5).max(1440).default(60),
  deliveryTypes: z.array(z.enum(DELIVERY_TYPES)).min(1),
  travelFee: z.number().min(0).max(1_000_000).optional(),
  images: z.array(imageSchema).max(12).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  bookingWindowDays: z.number().int().min(0).max(365).optional(),
});

export const updateProviderServiceSchema = createProviderServiceSchema.partial();

export type CreateProviderServiceInput = z.infer<typeof createProviderServiceSchema>;
export type UpdateProviderServiceInput = z.infer<typeof updateProviderServiceSchema>;

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export const createPortfolioItemSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  images: z.array(imageSchema).max(12).optional(),
  link: z.string().url().max(1024).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

export const updatePortfolioItemSchema = createPortfolioItemSchema.partial();

export type CreatePortfolioItemInput = z.infer<typeof createPortfolioItemSchema>;
export type UpdatePortfolioItemInput = z.infer<typeof updatePortfolioItemSchema>;

// ---------------------------------------------------------------------------
// Media upload
// ---------------------------------------------------------------------------

export const ALLOWED_UPLOAD_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Public list filters
// ---------------------------------------------------------------------------

export const listProvidersSchema = z.object({
  q: z.string().max(120).optional(),
  categoryId: z.string().uuid().optional(),
  city: z.string().max(120).optional(),
  travelToCustomer: z.boolean().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().positive().max(500).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type ListProvidersInput = z.infer<typeof listProvidersSchema>;

export const setProviderStatusSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED']),
  note: z.string().max(2000).optional(),
});

export type SetProviderStatusInput = z.infer<typeof setProviderStatusSchema>;
