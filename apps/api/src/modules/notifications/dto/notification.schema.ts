import { z } from 'zod';

export const inboxQuerySchema = z.object({
  unreadOnly: z.preprocess((v) => v === true || v === 'true', z.boolean().default(false)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type InboxQuery = z.infer<typeof inboxQuerySchema>;

export const upsertTemplateSchema = z.object({
  event: z.string().min(2).max(80),
  channel: z.enum(['INAPP', 'EMAIL', 'SMS', 'PUSH', 'WHATSAPP']),
  subject: z.string().max(300).nullable().optional(),
  body: z.string().min(1).max(8000),
  active: z.boolean().default(true),
});
export type UpsertTemplateInput = z.infer<typeof upsertTemplateSchema>;
