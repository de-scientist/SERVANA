/** Shared formatting helpers — money is rendered from backend values only. Never invent prices. */

export function formatKES(amountMajor: number, currency = 'KES'): string {
  if (!Number.isFinite(amountMajor)) return `${currency} —`;
  return `${currency} ${Math.round(amountMajor).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

/** Backend sends minor-unit strings (e.g. "200000"). Render safely without float math. */
export function formatMinorUnits(amountCents: number | string, currency = 'KES'): string {
  const n = typeof amountCents === 'string' ? Number(amountCents) : amountCents;
  if (!Number.isFinite(n)) return `${currency} —`;
  const major = Math.floor(n / 100);
  return formatKES(major, currency);
}

export function formatDateTime(iso: string, locale = 'en-KE'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso: string, locale = 'en-KE'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { dateStyle: 'medium' });
}

export function initials(name: string | null | undefined, fallback = 'S'): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || fallback;
}
