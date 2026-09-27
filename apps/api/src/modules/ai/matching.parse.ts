import { z } from 'zod';

/** Strict shape for parsed matching criteria — LLM output AND fallback agree on it. */
export const parsedCriteriaSchema = z.object({
  service: z.string().max(200).nullable().default(null),
  location: z.string().max(200).nullable().default(null),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .nullable()
    .default(null),
  budget: z.number().positive().max(100_000_000).nullable().default(null),
  preferences: z.array(z.string().max(100)).max(10).default([]),
});

export type ParsedCriteria = z.infer<typeof parsedCriteriaSchema>;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Deterministic fallback parser (also the accuracy baseline the LLM must beat).
 * Extracts service keywords, Kenyan locations, dates and KES budgets without
 * any model call — so matching works even when the provider is down.
 */
export function fallbackParse(query: string, now: Date = new Date()): ParsedCriteria {
  const q = query.toLowerCase();

  // Budget: "under KSh 3,000", "around 3000 shillings", "kes 2500", "below 5000".
  let budget: number | null = null;
  const budgetRe =
    /(?:under|below|around|about|approx(?:imately)?|up\s+to|max(?:imum)?|kes|ksh|kshs|shillings?|ksh\.?)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:kes|ksh|kshs|shillings?|bob)/i;
  const bm = budgetRe.exec(query);
  if (bm) {
    const raw = (bm[1] ?? bm[2] ?? '').replace(/,/g, '');
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) budget = Math.round(n);
  }

  // Date: today / tomorrow / weekday names / ISO dates.
  let date: string | null = null;
  if (/\btoday\b/.test(q)) {
    date = toISODate(now);
  } else if (/\btomorrow\b/.test(q)) {
    date = toISODate(new Date(now.getTime() + 86_400_000));
  } else {
    for (let i = 0; i < WEEKDAYS.length; i++) {
      if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(q)) {
        const delta = (i - now.getUTCDay() + 7) % 7 || 7;
        date = toISODate(new Date(now.getTime() + delta * 86_400_000));
        break;
      }
    }
    if (!date) {
      const iso = /(\d{4}-\d{2}-\d{2})/.exec(query);
      if (iso) date = iso[1];
    }
  }

  // Location: "in X", "around X", "near X", "at X" (X = 2+ letters).
  let location: string | null = null;
  const locRe = /(?:\bin\b|\baround\b|\bnear\b|\bnearby\b|\bat\b)\s+([a-z][a-z\s.'-]{1,40}?)(?=\s+(?:tomorrow|today|under|below|around|about|for|with|on|available|under|kes|ksh|\d)|[,.]|$)/i;
  const lm = locRe.exec(query);
  if (lm) {
    const cand = lm[1].trim().replace(/\s+/g, ' ');
    if (cand.length >= 2 && !/^(tomorrow|today|kes|ksh)/i.test(cand)) location = cand;
  }

  // Service: strip budgets, dates, punctuation, filler — what remains names the need.
  // (Budget first: punctuation stripping would split "3,000" into "3 000".)
  let service: string | null = null;
  let rest = query;
  rest = rest.replace(budgetRe, ' ');
  rest = rest.replace(/\btoday\b|\btomorrow\b/gi, ' ');
  for (const w of WEEKDAYS) rest = rest.replace(new RegExp(`\\b${w}\\b`, 'gi'), ' ');
  rest = rest.replace(/\d{4}-\d{2}-\d{2}/g, ' ');
  rest = rest.replace(/[.,!?;:()"]/g, ' ');
  rest = rest.replace(/\b(i need|i want|looking for|find me|book|need|want|please|hello|hi|hey|there|thanks|thank|you|sorry|a|an|the|in|around|near|nearby|at|for|with|on|available|under|below|about|around|kes|ksh|kshs|shillings?|bob|tomorrow|today)\b/gi, ' ');
  rest = rest.replace(/\s+/g, ' ').trim();
  if (location) {
    rest = rest.replace(new RegExp(location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (rest.length >= 2) service = rest.slice(0, 200);

  // Preferences: explicit soft signals.
  const preferences: string[] = [];
  if (/\bVerified\b/i.test(query)) preferences.push('verified only');
  if (/\b(top rated|highly rated|best|top)\b/i.test(q)) preferences.push('top rated');
  if (/\b(cheap|cheapest|affordable|budget)\b/i.test(q)) preferences.push('budget friendly');
  if (/\b(mobile|come to me|at home|house call)\b/i.test(q)) preferences.push('travels to customer');

  return { service, location, date, budget, preferences };
}
