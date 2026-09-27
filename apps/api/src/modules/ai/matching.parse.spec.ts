import { fallbackParse } from './matching.parse';

describe('fallbackParse (deterministic baseline)', () => {
  const TUESDAY = new Date('2026-09-22T10:00:00Z'); // a Tuesday

  it('parses the canonical example fully', () => {
    const out = fallbackParse(
      'I need a makeup artist tomorrow around Westlands under KSh 3,000.',
      TUESDAY,
    );
    expect(out.service).toBe('makeup artist');
    expect(out.location).toBe('Westlands');
    expect(out.date).toBe('2026-09-23'); // Wednesday
    expect(out.budget).toBe(3000);
  });

  it('resolves weekday names to the next occurrence', () => {
    const out = fallbackParse('Braids on Saturday please', TUESDAY);
    expect(out.date).toBe('2026-09-26');
    expect(out.service).toBe('Braids');
  });

  it('handles today, ISO dates and shilling variants', () => {
    expect(fallbackParse(' massage today ', TUESDAY).date).toBe('2026-09-22');
    expect(fallbackParse('nails 2026-10-05', TUESDAY).date).toBe('2026-10-05');
    expect(fallbackParse('facial around 2500 shillings', TUESDAY).budget).toBe(2500);
    expect(fallbackParse('haircut kes 1,500', TUESDAY).budget).toBe(1500);
  });

  it('extracts near/at locations and preference tags', () => {
    const out = fallbackParse('Best verified barber near Kilimani', TUESDAY);
    expect(out.location).toBe('Kilimani');
    expect(out.preferences).toContain('verified only');
    expect(out.preferences).toContain('top rated');
    expect(out.service).toMatch(/barber/);
  });

  it('returns nulls (never guesses) when nothing is stated', () => {
    const out = fallbackParse('hello there', TUESDAY);
    expect(out).toEqual({ service: null, location: null, date: null, budget: null, preferences: [] });
  });

  it('never emits an invalid date shape', () => {
    for (const q of ['braids someday soon', 'nails 32-99-0000', 'massage next blue moon']) {
      const out = fallbackParse(q, TUESDAY);
      expect(out.date === null || /^\d{4}-\d{2}-\d{2}$/.test(out.date!)).toBe(true);
    }
  });
});
