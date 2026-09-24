import { RankingService } from './ranking.service';

function makeProfile(overrides: Record<string, any> = {}) {
  return {
    id: 'prov1',
    userId: 'user1',
    businessName: 'Test Studio',
    slug: 'test-studio',
    bio: 'Bio',
    city: 'Nairobi',
    country: 'Kenya',
    tagline: 'Tag',
    websiteUrl: null,
    businessPhone: '0712345678',
    yearsExperience: 3,
    lat: -1.28,
    lng: 36.82,
    serviceRadiusKm: 10,
    ...overrides,
  };
}

function makePrisma(opts: {
  profile?: any;
  reviews?: any[];
  bookings?: any[];
  verification?: any;
} = {}) {
  const profile = opts.profile === undefined ? makeProfile() : opts.profile;
  return {
    providerProfile: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (!profile) return null;
        if (where.id && where.id === profile.id) return profile;
        if (where.userId && where.userId === profile.userId) return profile;
        return null;
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    review: {
      findMany: jest.fn().mockResolvedValue(opts.reviews ?? []),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue(opts.bookings ?? []),
    },
    providerVerification: {
      findUnique: jest.fn().mockResolvedValue(opts.verification ?? null),
    },
    providerRankingSnapshot: {
      upsert: jest.fn().mockResolvedValue({ id: 'snap1' }),
    },
  } as any;
}

function makeLogger() {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) } as any;
}

function review(id: string, overall: number, dimensions?: Array<{ name: string; score: number }>) {
  return {
    id,
    overall,
    response: null,
    dimensions: dimensions ?? [
      { name: 'Quality', score: overall },
      { name: 'Professionalism', score: overall },
      { name: 'Communication', score: overall },
      { name: 'Punctuality', score: overall },
      { name: 'Value', score: overall },
    ],
  };
}

function booking(id: string, status: string, customerId = 'cust1') {
  return {
    id,
    status,
    customerId,
    startsAt: new Date('2026-01-01T10:00:00Z'),
    endsAt: new Date('2026-01-01T12:00:00Z'),
    updatedAt: new Date('2026-01-01T11:50:00Z'),
  };
}

describe('RankingService', () => {
  describe('identity', () => {
    it('resolves a user id to the canonical profile id', async () => {
      const prisma = makePrisma();
      const svc = new RankingService(prisma, makeAudit(), makeLogger());

      const result = await svc.calculate('user1');

      expect(result.providerId).toBe('prov1');
      expect(prisma.providerRankingSnapshot.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { providerId: 'prov1' } }),
      );
    });

    it('throws when no profile exists', async () => {
      const prisma = makePrisma({ profile: null });
      const svc = new RankingService(prisma, makeAudit(), makeLogger());

      await expect(svc.calculate('ghost')).rejects.toThrow('Provider profile not found');
    });
  });

  describe('scoring math', () => {
    it('applies weights exactly once (perfect provider scores 100)', async () => {
      const bookings = Array.from({ length: 100 }, (_, i) =>
        booking(`b${i}`, 'COMPLETED', `cust${i % 10}`),
      );
      const reviews = Array.from({ length: 50 }, (_, i) => ({
        ...review(`r${i}`, 5),
        response: { id: `resp${i}` },
      }));
      const prisma = makePrisma({
        bookings,
        reviews,
        verification: { level: 'TRUSTED_PROVIDER', status: 'VERIFIED' },
      });
      const svc = new RankingService(prisma, makeAudit(), makeLogger());

      const result = await svc.calculate('prov1');

      // Weights sum to 1 and each normalized score caps at 100, so the
      // total is bounded by 100...
      expect(result.qualityScore).toBeLessThanOrEqual(100);
      expect(result.qualityScore).toBeGreaterThan(90);
      const weightSum = result.components.reduce((s, c) => s + c.weight, 0);
      expect(weightSum).toBeCloseTo(1, 10);
      // ...and equals the plain sum of weighted scores (weights applied once).
      const recomputed = result.components.reduce((s, c) => s + c.weightedScore, 0);
      expect(Math.abs(result.qualityScore - recomputed)).toBeLessThan(0.1);
    });

    it('damps a single perfect review via Bayesian averaging (no few-review domination)', async () => {
      const prisma = makePrisma({
        bookings: [booking('b1', 'COMPLETED')],
        reviews: [review('r1', 5)],
      });
      const svc = new RankingService(prisma, makeAudit(), makeLogger());

      const result = await svc.calculate('prov1');
      const rating = result.components.find((c) => c.name === 'Customer Rating')!;

      // (5*3.5 + 1*5) / 6 = 3.75 → 75/100, well below a raw 100.
      expect(rating.normalizedScore).toBeLessThan(100);
      expect(rating.normalizedScore).toBeCloseTo(75, 5);
      expect(rating.confidence).toBeLessThan(1);
    });

    it('uses log normalization so raw job volume cannot dominate', async () => {
      const many = Array.from({ length: 1000 }, (_, i) => booking(`b${i}`, 'COMPLETED', `cust${i}`));
      const prisma = makePrisma({ bookings: many, reviews: [] });
      const svc = new RankingService(prisma, makeAudit(), makeLogger());

      const result = await svc.calculate('prov1');
      const jobs = result.components.find((c) => c.name === 'Completed Jobs')!;

      expect(jobs.normalizedScore).toBeGreaterThan(0);
      expect(jobs.normalizedScore).toBeLessThanOrEqual(100);
      // 1000 jobs must not score 10x a 100-job provider: log scale compresses.
      const prisma100 = makePrisma({
        bookings: Array.from({ length: 100 }, (_, i) => booking(`b${i}`, 'COMPLETED', `cust${i}`)),
        reviews: [],
      });
      const svc100 = new RankingService(prisma100, makeAudit(), makeLogger());
      const r100 = await svc100.calculate('prov1');
      const jobs100 = r100.components.find((c) => c.name === 'Completed Jobs')!;
      expect(jobs.normalizedScore / jobs100.normalizedScore).toBeLessThan(2);
    });

    it('handles a provider with no reviews gracefully', async () => {
      const prisma = makePrisma({ bookings: [], reviews: [] });
      const svc = new RankingService(prisma, makeAudit(), makeLogger());

      const result = await svc.calculate('prov1');

      expect(result.signals.totalReviews).toBe(0);
      expect(result.signals.overallRating).toBe(0);
      expect(typeof result.qualityScore).toBe('number');
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(100);
      for (const c of result.components) {
        expect(c.normalizedScore).toBeGreaterThanOrEqual(0);
        expect(c.normalizedScore).toBeLessThanOrEqual(100);
      }
    });

    it('rewards repeat customers and penalizes cancellations', async () => {
      const bookings = [
        booking('b1', 'COMPLETED', 'custA'),
        booking('b2', 'COMPLETED', 'custA'),
        booking('b3', 'COMPLETED', 'custB'),
        booking('b4', 'CANCELLED', 'custC'),
      ];
      const prisma = makePrisma({ bookings, reviews: [] });
      const svc = new RankingService(prisma, makeAudit(), makeLogger());

      const result = await svc.calculate('prov1');

      expect(result.signals.repeatRate).toBeCloseTo(0.5, 5); // 1 of 2 customers repeats
      expect(result.signals.cancellationRate).toBeCloseTo(0.25, 5);
      const cancel = result.components.find((c) => c.name === 'Cancellation Rate')!;
      expect(cancel.normalizedScore).toBeCloseTo(75, 5);
    });
  });

  describe('dashboard', () => {
    it('returns trust signals and real dimension averages', async () => {
      const bookings = [booking('b1', 'COMPLETED'), booking('b2', 'COMPLETED')];
      const reviews = [
        review('r1', 5, [
          { name: 'Quality', score: 5 },
          { name: 'Professionalism', score: 5 },
          { name: 'Communication', score: 5 },
          { name: 'Punctuality', score: 2 },
          { name: 'Value', score: 4 },
        ]),
        review('r2', 4, [
          { name: 'Quality', score: 4 },
          { name: 'Professionalism', score: 4 },
          { name: 'Communication', score: 4 },
          { name: 'Punctuality', score: 2 },
          { name: 'Value', score: 4 },
        ]),
      ];
      const prisma = makePrisma({
        bookings,
        reviews,
        verification: { level: 'PROFESSIONAL_VERIFIED', status: 'VERIFIED' },
      });
      const svc = new RankingService(prisma, makeAudit(), makeLogger());

      const dashboard = await svc.getDashboard('prov1');

      expect(dashboard.trustSignals.rating).toBe(4.5);
      expect(dashboard.trustSignals.customersServed).toBe(1);
      expect(dashboard.trustSignals.completionRate).toBe(1);
      expect(dashboard.trustSignals.verified).toBe(true);
      // Averages come from real review rows only.
      expect(dashboard.insights.dimensionAverages.Quality).toBe(4.5);
      expect(dashboard.insights.dimensionAverages.Punctuality).toBe(2);
      // Weak dimension surfaces as an improvement area.
      expect(
        dashboard.insights.improvements.some((i) => i.includes('Punctuality')),
      ).toBe(true);
      expect(Array.isArray(dashboard.insights.strengths)).toBe(true);
    });
  });
});
