import { z } from 'zod';

export const searchSchema = z.object({
  q: z.string().min(1).max(120).optional(),
  categoryId: z.string().uuid().optional(),
  city: z.string().max(120).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.1).max(500).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  verified: z.coerce.boolean().optional(),
  travelToCustomer: z.coerce.boolean().optional(),
  availableOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});
export type SearchInput = z.infer<typeof searchSchema>;
