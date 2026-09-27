import { z } from 'zod';

export const DOCUMENT_KINDS = ['ID', 'CERT', 'BUSINESS_REG', 'OTHER'] as const;

export const submitVerificationSchema = z.object({
  level: z
    .enum(['BASIC', 'PHONE_VERIFIED', 'IDENTITY_VERIFIED', 'PROFESSIONAL_VERIFIED', 'BUSINESS_VERIFIED', 'TRUSTED_PROVIDER'])
    .optional(),
  notes: z.string().max(2000).optional(),
});

export const reviewVerificationSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  level: z
    .enum(['BASIC', 'PHONE_VERIFIED', 'IDENTITY_VERIFIED', 'PROFESSIONAL_VERIFIED', 'BUSINESS_VERIFIED', 'TRUSTED_PROVIDER'])
    .optional(),
  note: z.string().max(2000).optional(),
  rejectionReason: z.string().max(2000).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export const listVerificationsSchema = z.object({
  status: z
    .enum(['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'SUSPENDED'])
    .optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;
export type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;
export type ListVerificationsInput = z.infer<typeof listVerificationsSchema>;
