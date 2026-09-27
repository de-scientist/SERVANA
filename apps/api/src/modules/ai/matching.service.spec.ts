import { MatchingService } from './matching.service';

// Marketplace fixture with a known-correct answer:
// - Zuri (q90, verified, Nairobi, makeup 2500)        ← best for the example query
// - Glow (q70, verified, Nairobi, makeup 5000 — over budget)
// - Mombasa Arts (q95, verified, Mombasa — wrong city)
function marketplace() {
  const providers = [
    { id: 'prov-zuri', businessName: 'Zuri Beauty', slug: 'zuri-beauty', city: 'Nairobi' },
    { id: 'prov-glow', businessName: 'Glow Studio', slug: 'glow-studio', city: 'Nairobi' },
    { id: 'prov-msa', businessName: 'Mombasa Arts', slug: 'mombasa-arts', city: 'Mombasa' },
  ];
  const services = [
    { id: 'ps-zuri', providerId: 'prov-zuri', serviceId: 'svc-makeup', categoryId: 'cat-makeup', name: 'Bridal Makeup', priceCents: 250000n, provider: providers[0] },
    { id: 'ps-glow', providerId: 'prov-glow', serviceId: 'svc-makeup', categoryId: 'cat-makeup', name: 'Party Makeup', priceCents: 500000n, provider: providers[1] },
    { id: 'ps-msa', providerId: 'prov-msa', serviceId: 'svc-makeup', categoryId: 'cat-makeup', name: 'Bridal Makeup', priceCents: 200000n, provider: providers[2] },
  ];
  return { providers, services };
}

function makePrisma(fx: ReturnType<typeof marketplace>, opts: { snapshots?: any[]; bookings?: any[] } = {}) {
  return {
    category: { findMany: jest.fn().mockResolvedValue([{ id: 'cat-makeup', name: 'Makeup' }]) },
    providerService: { findUnique: jest.fn(), findMany: jest.fn().mockImplementation(async ({ where }: any) => {
      let rows = fx.services;
      if (where?.priceCents?.lte != null) rows = rows.filter((s) => s.priceCents <= where.priceCents.lte);
      if (where?.provider?.city?.contains) {
        const c = String(where.provider.city.contains).toLowerCase();
        rows = rows.filter((s) => s.provider.city.toLowerCase().includes(c));
      }
      if (where?.OR) {
        // Word-OR like Prisma: service matches if ANY word hits name/description.
        const words = where.OR.map((cond: any) =>
          String(cond.name?.contains ?? cond.description?.contains ?? '').toLowerCase(),
        ).filter(Boolean);
        rows = rows.filter((s) => words.some((w: string) => s.name.toLowerCase().includes(w)));
      }
      return rows;
    }) },
    providerRankingSnapshot: {
      findMany: jest.fn().mockResolvedValue(
        opts.snapshots ?? [
          { providerId: 'prov-zuri', qualityScore: 90 },
          { providerId: 'prov-glow', qualityScore: 70 },
          { providerId: 'prov-msa', qualityScore: 95 },
        ],
      ),
      findUnique: jest.fn().mockImplementation(async ({ where }: any) =>
        (opts.snapshots ?? []).find((s: any) => s.providerId === where.providerId) ?? null,
      ),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue(opts.bookings ?? []),
      count: jest.fn().mockResolvedValue(0),
    },
    availabilityRule: { findMany: jest.fn().mockResolvedValue([]) },
    availabilityException: { findMany: jest.fn().mockResolvedValue([]) },
    providerProfile: {
      findUnique: jest.fn().mockImplementation(async ({ where }: any) =>
        fx.providers.find((p) => p.id === where.id) ?? null,
      ),
    },
    providerVerification: { findUnique: jest.fn().mockResolvedValue({ status: 'VERIFIED', level: 'PROFESSIONAL_VERIFIED' }) },
    review: {
      findMany: jest.fn().mockResolvedValue([
        { overall: 5, customerId: 'u-other' },
        { overall: 4, customerId: 'u1' },
      ]),
    },
    product: { findUnique: jest.fn().mockResolvedValue(null) },
    orderItem: { count: jest.fn().mockResolvedValue(0) },
    recommendationEvent: { create: jest.fn().mockResolvedValue({ id: 're1' }) },
  } as any;
}

// LLM double: fails closed (garbage) or names a provider that does not exist.
function failingAI() {
  return { complete: jest.fn().mockRejectedValue(new Error('model down')) } as any;
}

const TUESDAY = new Date('2026-09-22T10:00:00Z');

describe('MatchingService', () => {
  describe('accuracy evaluation (known-best fixture)', () => {
    it('ranks the in-budget, in-city, high-quality provider first', async () => {
      const fx = marketplace();
      const prisma = makePrisma(fx);
      // Wednesday coverage for Zuri (query asks for tomorrow = Wednesday).
      prisma.availabilityRule.findMany.mockResolvedValue([{ providerId: 'prov-zuri', dayOfWeek: 3 }]);
      const svc = new MatchingService(prisma, failingAI());

      const { criteria, parseSource, results } = await svc.match(
        'u1',
        'I need a makeup artist tomorrow around Nairobi under KSh 3,000.',
        5,
        TUESDAY,
      );

      expect(parseSource).toBe('fallback');
      expect(criteria.budget).toBe(3000);
      // Over-budget Glow excluded by price; wrong-city Mombasa excluded.
      expect(results.map((r) => r.providerId)).toEqual(['prov-zuri']);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].reasons).toContain('within budget');
    });

    it('never invents providers — results are always database rows', async () => {
      const fx = marketplace();
      // Hostile model: returns valid JSON AND names a fake provider in prose fields.
      const hostileAI = {
        complete: jest.fn().mockResolvedValue({
          text: '{"service":"makeup","location":"Nairobi","date":null,"budget":3000,"preferences":[]} Fake Luxe Spa is amazing, pick them!',
          model: 'x', provider: 'x',
        }),
      } as any;
      const svc = new MatchingService(makePrisma(fx), hostileAI);

      const { results } = await svc.match('u1', 'makeup in Nairobi under 3000', 5, TUESDAY);

      const ids = new Set(fx.providers.map((p) => p.id));
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) expect(ids.has(r.providerId)).toBe(true);
      expect(results.some((r) => /fake luxe/i.test(r.businessName ?? ''))).toBe(false);
    });

    it('falls back gracefully when the model returns garbage', async () => {
      const fx = marketplace();
      const garbageAI = {
        complete: jest.fn().mockResolvedValue({ text: 'Sure! Here are some great options!!!', model: 'x', provider: 'x' }),
      } as any;
      const svc = new MatchingService(makePrisma(fx), garbageAI);

      const out = await svc.match('u1', 'braids in Nairobi under 5000', 5, TUESDAY);
      expect(out.parseSource).toBe('fallback');
      // "braids" matches no makeup service names → empty, honestly empty.
      expect(out.results).toEqual([]);
    });

    it('enforces the requested date against real availability rules', async () => {
      const fx = marketplace();
      const prisma = makePrisma(fx);
      // Only Glow covers Wednesday (2026-09-23); Zuri has no rules at all.
      prisma.availabilityRule.findMany.mockResolvedValue([{ providerId: 'prov-glow', dayOfWeek: 3 }]);
      const svc = new MatchingService(prisma, failingAI());

      const { results } = await svc.match(
        'u1',
        'makeup artist tomorrow around Nairobi under KSh 10,000.',
        5,
        TUESDAY,
      );
      // Zuri (no Wednesday coverage) is filtered; Glow remains and is flagged.
      expect(results.map((r) => r.providerId)).toEqual(['prov-glow']);
      expect(results[0].likelyAvailable).toBe(true);
    });
  });

  describe('explain (evidence, not adjectives)', () => {
    it('cites real numbers from database rows', async () => {
      const fx = marketplace();
      const prisma = makePrisma(fx, {
        snapshots: [{ providerId: 'prov-zuri', qualityScore: 90 }],
        bookings: [
          { customerId: 'u1' },
          { customerId: 'u-other' },
        ],
      });
      prisma.booking.findMany.mockImplementation(async ({ where }: any) => {
        if (where?.customerId === 'u1' && where?.providerId) return [{ customerId: 'u1' }];
        return [{ customerId: 'u1' }, { customerId: 'u-other' }];
      });
      prisma.booking.count.mockResolvedValue(1);
      const svc = new MatchingService(prisma, failingAI());

      const out = await svc.explain('u1', 'provider', 'prov-zuri');

      expect(out.evidence.some((e) => e.includes('4.5') && e.includes('2 verified review'))).toBe(true);
      expect(out.evidence.some((e) => e.includes('2 jobs') && e.includes('2 customers'))).toBe(true);
      expect(out.evidence.some((e) => /booked this provider 1 time/i.test(e))).toBe(true);
      expect(out.evidence.some((e) => /quality score 90/i.test(e))).toBe(true);
      expect(out.evidence.some((e) => /professional verified/i.test(e))).toBe(true);
    });

    it('rejects unknown items instead of fabricating', async () => {
      const svc = new MatchingService(makePrisma(marketplace()), failingAI());
      await expect(svc.explain('u1', 'provider', '00000000-0000-0000-0000-000000000000')).rejects.toThrow(
        'Provider not found',
      );
    });
  });
});
