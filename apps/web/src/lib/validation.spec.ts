import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  passwordSchema,
  registerSchema,
  resetPasswordSchema,
} from './validation';

describe('web validation schemas', () => {
  it('rejects weak passwords', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('allletters1').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
    expect(passwordSchema.safeParse('Str0ngPass!').success).toBe(true);
  });

  it('registers with a valid payload', () => {
    const res = registerSchema.safeParse({ name: 'Ada', email: 'a@b.com', password: 'Str0ngPass!', role: 'CUSTOMER' });
    expect(res.success).toBe(true);
  });

  it('defaults role to CUSTOMER when omitted', () => {
    const res = registerSchema.parse({ name: 'Ada', email: 'a@b.com', password: 'Str0ngPass!' });
    expect(res.role).toBe('CUSTOMER');
  });

  it('requires a strong password on reset', () => {
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: 'weak' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: 'Str0ngPass!' }).success).toBe(true);
  });

  it('requires current password when changing password', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: '', password: 'Str0ngPass!' }).success).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'OldPass1', password: 'Str0ngPass!' }).success,
    ).toBe(true);
  });
});
