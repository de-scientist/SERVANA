/**
 * Pure guardrail helpers — no I/O, fully unit-testable.
 *
 * Layers: input validation (zod at the boundary) → injection screen →
 * PII minimization → provider call → output validation → logging.
 */

// --- PII minimization ------------------------------------------------------------

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// International / Kenyan phone-ish runs: +254..., 07..., with spaces/dashes.
const PHONE_RE = /(?:\+\d[\d\s-]{6,}\d|0[17]\d[\d\s-]{6,}\d)/g;

const SENSITIVE_KEYS = new Set([
  'email',
  'emailaddress',
  'phone',
  'phonenumber',
  'mobilenumber',
  'password',
  'passwordhash',
  'address',
  'idnumber',
  'nationalid',
  'pin',
  'passport',
]);

export function stripPiiText(text: string): string {
  if (!text) return text;
  return text.replace(EMAIL_RE, '[redacted-email]').replace(PHONE_RE, '[redacted-phone]');
}

export function minimizeObject<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => minimizeObject(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[redacted]';
      } else {
        out[k] = minimizeObject(v);
      }
    }
    return out as T;
  }
  if (typeof value === 'string') return stripPiiText(value) as unknown as T;
  return value;
}

// --- prompt-injection screening -------------------------------------------------------

const INJECTION_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i, label: 'ignore-instructions' },
  { re: /disregard\s+.*instructions?/i, label: 'disregard-instructions' },
  { re: /forget\s+(all\s+|your\s+)?(previous\s+)?instructions?/i, label: 'forget-instructions' },
  { re: /you\s+are\s+now\s+/i, label: 'role-reassign' },
  { re: /^\s*system\s*:/im, label: 'system-role' },
  { re: /<\|\s*system\s*\|>/i, label: 'system-tag' },
  { re: /jailbreak/i, label: 'jailbreak' },
  { re: /\bDAN\s+mode\b/i, label: 'dan-mode' },
  { re: /do\s+anything\s+now/i, label: 'dan-mode' },
  { re: /override\s+.*(policy|policies|safety|guardrail)/i, label: 'override-policy' },
  { re: /reveal\s+(your|the)\s+(prompt|instructions|system)/i, label: 'prompt-extract' },
  { re: /show\s+(me\s+)?your\s+(prompt|instructions|system)/i, label: 'prompt-extract' },
];

export interface InjectionScreen {
  flagged: boolean;
  categories: string[];
}

/** Score user-supplied text for instruction-override attempts. */
export function screenInjection(text: string): InjectionScreen {
  const categories: string[] = [];
  for (const p of INJECTION_PATTERNS) {
    if (p.re.test(text)) categories.push(p.label);
  }
  return { flagged: categories.length > 0, categories };
}

// --- token + cost accounting ---------------------------------------------------------------

/** Char-based estimate (≈4 chars/token). Estimates only — never billed. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

const MODEL_RATES_PER_1K_TOKENS_CENTS: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /stub/i, input: 0, output: 0 },
  { match: /gpt-4o-mini|haiku/i, input: 0.015, output: 0.06 },
  { match: /gpt-4o|sonnet/i, input: 0.25, output: 1 },
  { match: /gpt-4|opus/i, input: 1.5, output: 6 },
];

/** Cost in integer cents (rounds up; 0 for stub/local models). */
export function estimateCostCents(model: string, inputTokens: number, outputTokens: number): bigint {
  const table = MODEL_RATES_PER_1K_TOKENS_CENTS.find((r) => r.match.test(model)) ?? {
    input: Number(process.env.AI_DEFAULT_INPUT_CENTS_PER_1K ?? 0.1),
    output: Number(process.env.AI_DEFAULT_OUTPUT_CENTS_PER_1K ?? 0.4),
  };
  const cents = (inputTokens / 1000) * table.input + (outputTokens / 1000) * table.output;
  return BigInt(Math.ceil(cents));
}
