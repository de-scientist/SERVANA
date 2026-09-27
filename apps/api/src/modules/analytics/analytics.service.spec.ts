import { AnalyticsService } from './analytics.service';

function makePrisma(opts: {
  events?: Array<{ type: string }>;
  touches?: any[];
  payments?: any[];
  commissions?: any[];
  refunds?: any[];
  bookings?: any[];
  orders?: any[];
  reviews?: any[];
} = {}) {
  const events = opts.events ?? [];
  return {
    analyticsEvent: {
      create: jest.fn().mockResolvedValue({ id: 'e1' }),
      count: jest.fn().mockImplementation(async ({ where }: any) => events.filter((e) => !where?.type || e.type === where.type).length),
      findMany: jest.fn().mockResolvedValue([]),
    },
    attribution: {
      create: jest.fn().mockResolvedValue({ id: 'a1' }),
      findMany: jest.fn().mockResolvedValue(opts.touches ?? []),
    },
    payment: {
      findMany: jest.fn().mockResolvedValue(opts.payments ?? []),
    },
    commission: {
      findMany: jest.fn().mockResolvedValue(opts.commissions ?? []),
    },
    refund: {
      findMany: jest.fn().mockResolvedValue(opts.refunds ?? []),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue(opts.bookings ?? []),
    },
    order: {
      findMany: jest.fn().mockResolvedValue(opts.orders ?? []),
    },
    review: {
      findMany: jest.fn().mockResolvedValue(opts.reviews ?? []),
    },
  } as any;
}

function svc(prisma?: any) {
  return new AnalyticsService(prisma ?? makePrisma());
}

describe('AnalyticsService', () => {
  describe('track', () => {
    it('persists allowlisted events with payloads', async () => {
      const prisma = makePrisma();
      const s = svc(prisma);

      await s.track('BOOKING_CREATED', { userId: 'u1', payload: { bookingId: 'b1' } });

      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'BOOKING_CREATED', userId: 'u1' }),
        }),
      );
    });

    it('ignores unknown event types (no vanity/typo pollution)', async () => {
      const prisma = makePrisma();
      const s = svc(prisma);

      await s.track('SOMETHING_RANDOM', { payload: {} });

      expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
    });

    it('never throws', async () => {
      const prisma = makePrisma();
      prisma.analyticsEvent.create.mockRejectedValue(new Error('db down'));
      const s = svc(prisma);

      await expect(s.track('BOOKING_CREATED', {})).resolves.toBeUndefined();
    });
  });

  describe('trackAttribution', () => {
    it('records touches with all supported fields', async () => {
      const prisma = makePrisma();
      const s = svc(prisma);

      const out = await s.trackAttribution({
        sessionId: 's1',
        userId: 'u1',
        utmSource: 'Instagram',
        utmMedium: 'social',
        utmCampaign: 'summer',
        utmContent: 'reel-3',
        referralCode: 'SVN-ABC123',
        providerSlug: 'zuri-studio',
      });

      expect(out.recorded).toBe(true);
      expect(prisma.attribution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ utmSource: 'Instagram', providerSlug: 'zuri-studio' }),
        }),
      );
    });

    it('ignores empty touches', async () => {
      const prisma = makePrisma();
      const s = svc(prisma);

      const out = await s.trackAttribution({});
      expect(out.recorded).toBe(false);
      expect(prisma.attribution.create).not.toHaveBeenCalled();
    });
  });

  describe('overview (money you can trust)', () => {
    it('aggregates revenue, commission, refunds and repeat rate from ledger tables', async () => {
      const prisma = makePrisma({
        payments: [
          { grossCents: 200000n, feeCents: 0n },
          { grossCents: 100000n, feeCents: 500n },
        ],
        commissions: [{ commissionCents: 20000n }, { commissionCents: 10000n }],
        refunds: [{ amountCents: 50000n }],
        bookings: [
          { status: 'COMPLETED', customerId: 'c1' },
          { status: 'COMPLETED', customerId: 'c1' },
          { status: 'COMPLETED', customerId: 'c2' },
          { status: 'CANCELLED', customerId: 'c3' },
        ],
      });
      const s = svc(prisma);

      const out = await s.overview({});

      expect(out.revenue.grossCents).toBe('300000');
      expect(out.revenue.payments).toBe(2);
      expect(out.revenue.paymentFeesCents).toBe('500');
      expect(out.revenue.commissionCents).toBe('30000');
      expect(out.revenue.refundedCents).toBe('50000');
      expect(out.revenue.netCents).toBe('250000');
      expect(out.bookings.total).toBe(4);
      expect(out.bookings.completed).toBe(3);
      expect(out.bookings.completionRate).toBe(0.75);
      // c1 repeated (2 completed), c2 once → 1/2.
      expect(out.retention.customersWithBookings).toBe(2);
      expect(out.retention.repeatCustomers).toBe(1);
      expect(out.retention.repeatRate).toBe(0.5);
    });

    it('handles an empty marketplace without NaNs', async () => {
      const s = svc();
      const out = await s.overview({});
      expect(out.revenue.grossCents).toBe('0');
      expect(out.bookings.completionRate).toBe(0);
      expect(out.retention.repeatRate).toBe(0);
    });
  });

  describe('funnel', () => {
    it('computes stage rates with zero-safe denominators', async () => {
      const events = [
        ...Array.from({ length: 100 }, () => ({ type: 'SERVICE_VIEWED' })),
        ...Array.from({ length: 40 }, () => ({ type: 'BOOKING_STARTED' })),
        ...Array.from({ length: 20 }, () => ({ type: 'BOOKING_CREATED' })),
        ...Array.from({ length: 15 }, () => ({ type: 'PAYMENT_SUCCESSFUL' })),
      ];
      const s = svc(makePrisma({ events }));

      const f = await s.funnel({});
      expect(f.viewed).toBe(100);
      expect(f.viewToStart).toBe(0.4);
      expect(f.startToCreate).toBe(0.5);
      expect(f.createToPay).toBe(0.75);
      expect(f.overall).toBe(0.15);
    });

    it('returns zeros when there is no traffic', async () => {
      const f = await svc().funnel({});
      expect(f.overall).toBe(0);
      expect(f.viewToStart).toBe(0);
    });
  });

  describe('providers', () => {
    it('ranks by revenue with ratings joined', async () => {
      const prisma = makePrisma({
        payments: [
          { providerId: 'p1', grossCents: 200000n, commissionCents: 20000n, bookingId: 'b1' },
          { providerId: 'p1', grossCents: 200000n, commissionCents: 20000n, bookingId: 'b2' },
          { providerId: 'p2', grossCents: 50000n, commissionCents: 5000n, bookingId: null },
        ],
        reviews: [
          { providerId: 'p1', overall: 5 },
          { providerId: 'p1', overall: 4 },
        ],
      });
      const s = svc(prisma);

      const out = await s.providers({});
      expect(out.data[0].providerId).toBe('p1');
      expect(out.data[0].revenueCents).toBe('400000');
      expect(out.data[0].completedJobs).toBe(2);
      expect(out.data[0].avgRating).toBe(4.5);
      expect(out.data[0].totalReviews).toBe(2);
      // Order-linked payment (no booking) counts revenue, not jobs.
      expect(out.data[1].completedJobs).toBe(0);
    });
  });

  describe('products', () => {
    it('counts only money-confirmed orders and ranks top sellers', async () => {
      const prisma = makePrisma({
        orders: [
          {
            status: 'DELIVERED',
            items: [{ productId: 'prod1', qty: 2, unitCents: 150000n, product: { name: 'Oil' } }],
          },
          { status: 'PENDING', items: [{ productId: 'prod1', qty: 5, unitCents: 150000n, product: { name: 'Oil' } }] },
          { status: 'CANCELLED', items: [{ productId: 'prod9', qty: 9, unitCents: 1000n, product: { name: 'X' } }] },
        ],
      });
      const s = svc(prisma);

      const out = await s.products({});
      expect(out.orders).toBe(1);
      expect(out.units).toBe(2);
      expect(out.salesCents).toBe('300000');
      expect(out.topProducts).toHaveLength(1);
      expect(out.topProducts[0].productId).toBe('prod1');
    });
  });

  describe('attribution', () => {
    it('uses first-touch per user with direct fallback', async () => {
      const prisma = makePrisma({
        touches: [
          { userId: 'u1', utmSource: 'Instagram', providerSlug: null, createdAt: new Date('2026-01-01') },
          { userId: 'u1', utmSource: 'TikTok', providerSlug: null, createdAt: new Date('2026-02-01') },
          { userId: null, utmSource: null, providerSlug: 'zuri-studio', createdAt: new Date('2026-01-02') },
        ],
        bookings: [{ customerId: 'u1' }, { customerId: 'u2' }],
        payments: [
          { customerId: 'u1', grossCents: 200000n },
          { customerId: 'u2', grossCents: 50000n },
        ],
      });
      const s = svc(prisma);

      const out = await s.attribution({});
      const ig = out.channels.find((c) => c.channel === 'Instagram')!;
      // First touch wins: TikTok touch ignored for u1.
      expect(ig.bookings).toBe(1);
      expect(ig.revenueCents).toBe('200000');
      const direct = out.channels.find((c) => c.channel === 'direct')!;
      expect(direct.bookings).toBe(1);
      expect(direct.revenueCents).toBe('50000');
      expect(out.providerViews).toEqual([{ providerSlug: 'zuri-studio', views: 1 }]);
    });
  });
});
