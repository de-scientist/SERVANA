import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(20).nullable().optional(),
  profileImage: z.string().url().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  address: z.record(z.unknown()).nullable().optional(),
  preferences: z.record(z.unknown()).nullable().optional(),
});

export const setStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SetStatusInput = z.infer<typeof setStatusSchema>;
