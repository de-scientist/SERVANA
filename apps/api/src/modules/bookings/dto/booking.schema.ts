import { z } from 'zod';

export const ServiceDeliveryType = z.enum([
  'AT_PROVIDER_LOCATION',
  'AT_CUSTOMER_LOCATION',
  'REMOTE',
  'EITHER',
]);

export const createBookingSchema = z.object({
  providerServiceId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  deliveryType: ServiceDeliveryType,
  address: z.record(z.string()).optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const bookingActionSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type BookingActionInput = z.infer<typeof bookingActionSchema>;

export const listBookingsSchema = z.object({
  view: z
    .enum(['upcoming', 'active', 'completed', 'cancelled', 'pending', 'all'])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});
export type ListBookingsInput = z.infer<typeof listBookingsSchema>;
