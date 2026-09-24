import { z } from 'zod';

export const openThreadSchema = z.object({
  bookingId: z.string().uuid(),
});
export type OpenThreadInput = z.infer<typeof openThreadSchema>;

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const messagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

export const reportConversationSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});
export type ReportConversationInput = z.infer<typeof reportConversationSchema>;

export const reviewReportSchema = z.object({
  status: z.enum(['REVIEWED', 'ACTIONED', 'DISMISSED']),
  note: z.string().max(1000).optional(),
});
export type ReviewReportInput = z.infer<typeof reviewReportSchema>;

export const reportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'REVIEWED', 'ACTIONED', 'DISMISSED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
