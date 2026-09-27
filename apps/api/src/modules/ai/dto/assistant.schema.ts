import { z } from 'zod';

export const assistantChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(10)
    .optional(),
});
export type AssistantChatInput = z.infer<typeof assistantChatSchema>;

export const adminAskSchema = z.object({
  question: z.string().trim().min(3).max(1000),
});
export type AdminAskInput = z.infer<typeof adminAskSchema>;

export const providerAssistSchema = z.object({
  kind: z.enum(['service-description', 'promotion-copy', 'instagram-caption', 'whatsapp-message', 'performance-explainer']),
  topic: z.string().trim().min(3).max(500).optional(),
  tone: z.enum(['Professional', 'Friendly', 'Luxury', 'Playful', 'Minimal']).default('Friendly'),
  serviceId: z.string().uuid().optional(),
});
export type ProviderAssistInput = z.infer<typeof providerAssistSchema>;
