export const DEFAULT_CURRENCY = 'KES';

/**
 * Convert a major-unit amount (e.g. 2000) to integer minor units (200000 cents).
 * All money is stored and computed as BigInt minor units — never Float.
 */
export function toMinorUnits(amount: number | string, decimals = 2): bigint {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) throw new Error('Invalid amount');
  const factor = 10 ** decimals;
  return BigInt(Math.round(value * factor));
}

/** Convert integer minor units back to a major-unit number (display only). */
export function fromMinorUnits(minor: bigint | number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Number(minor) / factor;
}

/**
 * Compute commission in minor units from a base and a rate expressed in
 * basis points (e.g. 1000 bp = 10%). Integer arithmetic, banker-safe rounding.
 */
export function calculateCommission(baseCents: bigint, rateBasisPoints: number): bigint {
  if (rateBasisPoints < 0) throw new Error('rate must be >= 0');
  return (baseCents * BigInt(rateBasisPoints)) / 10000n;
}

/** Provider net earnings = gross - commission - fee. */
export function calculateNet(
  grossCents: bigint,
  commissionCents: bigint,
  feeCents: bigint,
): bigint {
  return grossCents - commissionCents - feeCents;
}

export function formatMoney(minor: bigint | number, currency = DEFAULT_CURRENCY): string {
  return `${currency} ${fromMinorUnits(minor).toFixed(2)}`;
}
