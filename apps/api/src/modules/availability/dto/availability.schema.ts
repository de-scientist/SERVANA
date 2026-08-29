import { z } from 'zod';

export const ExceptionType = z.enum(['TIME_OFF', 'EXTRA', 'HOLIDAY']);
export type ExceptionType = z.infer<typeof ExceptionType>;

export const availabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMin: z.number().int().min(0).max(1439),
  endMin: z.number().int().min(1).max(1440),
  breakStart: z.number().int().min(0).max(1439).nullable().optional(),
  breakEnd: z.number().int().min(0).max(1440).nullable().optional(),
});

export const availabilityExceptionSchema = z.object({
  date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  type: ExceptionType,
  note: z.string().max(500).optional(),
});

export const updateAvailabilitySchema = z.object({
  rules: z.array(availabilityRuleSchema).max(7),
  exceptions: z.array(availabilityExceptionSchema).max(200),
});
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

export const listSlotsSchema = z.object({
  serviceId: z.string().uuid(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  days: z.coerce.number().int().min(1).max(30).optional(),
});
export type ListSlotsInput = z.infer<typeof listSlotsSchema>;
