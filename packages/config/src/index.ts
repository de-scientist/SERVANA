export const APP_NAME = process.env.APP_NAME ?? 'SERVANA';

export const MONEY = {
  /** Default currency for the platform. */
  defaultCurrency: 'KES',
  /** Decimal places per currency (used for display only; storage is integer minor units). */
  decimals: 2,
} as const;

/** Convert major-unit string/number to integer minor units (cents). */
export function toMinorUnits(amount: number | string, decimals = MONEY.decimals): bigint {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  const factor = 10 ** decimals;
  return BigInt(Math.round(value * factor));
}

/** Convert integer minor units back to a major-unit number (display only). */
export function fromMinorUnits(minor: bigint | number, decimals = MONEY.decimals): number {
  const factor = 10 ** decimals;
  return Number(minor) / factor;
}
