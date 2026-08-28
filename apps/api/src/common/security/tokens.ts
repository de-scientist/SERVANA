import { createHash, randomBytes } from 'crypto';

/**
 * High-entropy opaque token (used for email verification, password reset and
 * refresh-token lookup keys). Returned to the user raw; only the hash is stored.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Stable sha256 lookup key for an opaque token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenExpiry(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

export function isExpired(date: Date | null): boolean {
  return !date || date.getTime() < Date.now();
}
