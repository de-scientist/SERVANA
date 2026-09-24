import { ForecastService } from './forecast.service';

function makePrisma(bookings: any[] = [], providers: any[] = []) {
  return {
    booking: {
      findMany: jest.fn().mockImplementation(async ({ where }: any) => {
        let rows = bookings;
        if (where?.customerId) rows = rows.filter((b) => b.customerId === where.customerId);
        return rows;
      }),
    },
    providerProfile: {
      findMany: jest.fn().mockImplementation(async ({ where }: any) => {
        if (where?.city?.contains) {
          return providers.filter((p) =>
            (p.city ?? '').toLowerCase().includes(String(where.city.contains).toLowerCase()),
          );
        }
        return providers;
      }),
    },
    review: { count: jest.fn().mockResolvedValue(0) },
  } as any;
}

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day);

describe('ForecastService (explicitly experimental)', () => {
  describe('demandForecast', () => {
    it('projects the trailing mean and always carries the disclaimer', async () => {
      // 56 bookings over the last 28 days → mean 2/day.
      const bookings = Array.from({ length: 56 }, (_, i) => ({
        createdAt: ago((i % 28) + 1),
        providerService: { categoryId: 'c1' },
      }));
      const prisma = makePrisma(bookings);
      const analytics = { churnScore: jest.fn() } as any;
      const svc = new ForecastService(prisma, analytics);

      const out = await svc.demandForecast({});

      expect(out.history.length).toBeGreaterThan(0);
      expect(out.projection).toHaveLength(7);
      expect(out.projection.every((p) => p.bookings === 2)).toBe(true);
      expect(out.method).toBe('trailing-28d-daily-mean');
      expect(out.dataSufficient).toBe(true);
      expect(out.disclaimer).toMatch(/Experimental/);
    });

    it('flags insufficient data instead of claiming accuracy', async () => {
      const prisma = makePrisma([
        { createdAt: ago(2), providerService: { categoryId: 'c1' } },
      ]);
      const svc = new ForecastService(prisma, { churnScore: jest.fn() } as any);

      const out = await svc.demandForecast({});
      expect(out.dataSufficient).toBe(false);
      expect(out.disclaimer).toMatch(/Do not make/);
    });

    it('scopes by category and city', async () => {
      const bookings = [
        { createdAt: ago(3), providerService: { categoryId: 'c1' } },
        { createdAt: ago(3), providerService: { categoryId: 'c2' } },
      ];
      const prisma = makePrisma(bookings, [{ id: 'p1', city: 'Nairobi' }]);
      const svc = new ForecastService(prisma, { churnScore: jest.fn() } as any);

      const out = await svc.demandForecast({ categoryId: 'c1', city: 'Nairobi' });
      expect(out.categoryId).toBe('c1');
      expect(out.city).toBe('Nairobi');
    });
  });

  describe('churnWatchlist', () => {
    it('lists HIGH-risk customers and marks itself experimental', async () => {
      const prisma = makePrisma([
        { customerId: 'quiet', status: 'COMPLETED', startsAt: ago(100) },
        { customerId: 'quiet', status: 'COMPLETED', startsAt: ago(120) },
        { customerId: 'active', status: 'COMPLETED', startsAt: ago(2) },
      ]);
      prisma.booking.findMany.mockImplementation(async ({ where, select }: any) => {
        const all = [
          { customerId: 'quiet', status: 'COMPLETED', startsAt: ago(100) },
          { customerId: 'quiet', status: 'COMPLETED', startsAt: ago(120) },
          { customerId: 'active', status: 'COMPLETED', startsAt: ago(2) },
        ];
        if (where?.customerId) return all.filter((b) => b.customerId === where.customerId);
        return all.map((b) => ({ customerId: b.customerId }));
      });
      const analytics = {
        churnScore: jest.fn().mockImplementation(async (id: string) =>
          id === 'quiet'
            ? { risk: 'HIGH', daysSinceLastBooking: 100, completedBookings: 2 }
            : { risk: 'LOW', daysSinceLastBooking: 2, completedBookings: 1 },
        ),
      } as any;
      const svc = new ForecastService(prisma, analytics);

      const out = await svc.churnWatchlist(10);
      expect(out.experimental).toBe(true);
      expect(out.customers.map((c) => c.customerId)).toEqual(['quiet']);
    });
  });
});
