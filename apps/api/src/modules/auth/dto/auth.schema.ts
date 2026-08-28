import { z } from 'zod';

/** Shared password rule: >=8 chars, at least one letter and one digit. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  name: z.string().min(2, 'Enter your name').max(120),
  email: z.string().email('Enter a valid email'),
  phone: z.string().max(20).optional(),
  password: passwordSchema,
  // A user may register as a customer and/or a provider. Defaults to CUSTOMER.
  role: z.enum(['CUSTOMER', 'PROVIDER']).default('CUSTOMER'),
});

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Missing reset token'),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Missing verification token'),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('Enter a valid email'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  password: passwordSchema,
});

export const changeEmailSchema = z.object({
  password: z.string().min(1, 'Enter your password'),
  email: z.string().email('Enter a valid email'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
