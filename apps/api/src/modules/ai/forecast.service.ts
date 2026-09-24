import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIAnalyticsService, ChurnRisk } from './ai-analytics.service';

export interface DemandPoint {
  date: string;
  bookings: number;
}

export interface DemandForecast {
  categoryId: string | null;
  city: string | null;
  history: DemandPoint[];
  projection: DemandPoint[];
  method: string;
  /** False until enough history exists — no accuracy is claimed before then. */
  dataSufficient: boolean;
  disclaimer: string;
}

const DISCLAIMER =
  'Experimental planning signal only — based on a short moving average, not a validated predictive model. Do not make staffing or spending commitments on it.';

/**
 * Early demand forecasting + churn watchlist. Deliberately simple
 * (moving averages, rule thresholds) and explicitly labeled experimental:
 * the data pipelines are production-grade so real models can replace the
 * math later without changing consumers.
 */
@Injectable()
export class ForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AIAnalyticsService,
  ) {}

  /**
   * 7-day booking projection from the trailing-28d daily mean, optionally
   * scoped by service category and provider city.
   */
  async demandForecast(input: { categoryId?: string; city?: string } = {}): Promise<DemandForecast> {
    const now = new Date();
    const start = new Date(now.getTime() - 28 * 86_400_000);

    let providerIds: string[] | undefined;
    if (input.city) {
      const providers = await this.prisma.providerProfile.findMany({
        where: { city: { contains: input.city, mode: 'insensitive' } },
        select: { id: true },
        take: 2000,
      });
      providerIds = providers.map((p) => p.id);
      if (!providerIds.length) {
        return this.empty(input, []);
      }
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        createdAt: { gte: start },
        ...(providerIds ? { providerId: { in: providerIds } } : {}),
      },
      select: {
        createdAt: true,
        providerService: { select: { categoryId: true } },
      },
      take: 10000,
    });
    const scoped = input.categoryId
      ? bookings.filter((b) => (b as any).providerService?.categoryId === input.categoryId)
      : bookings;

    const byDay = new Map<string, number>();
    for (const b of scoped) {
      const key = b.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const history: DemandPoint[] = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, bookings]) => ({ date, bookings }));

    const dataSufficient = scoped.length >= 30 && history.length >= 14;
    const mean = scoped.length ? scoped.length / 28 : 0;
    const projection: DemandPoint[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() + (i + 1) * 86_400_000);
      return { date: d.toISOString().slice(0, 10), bookings: Math.round(mean * 10) / 10 };
    });

    return {
      categoryId: input.categoryId ?? null,
      city: input.city ?? null,
      history,
      projection,
      method: 'trailing-28d-daily-mean',
      dataSufficient,
      disclaimer: DISCLAIMER,
    };
  }

  private empty(input: { categoryId?: string; city?: string }, history: DemandPoint[]): DemandForecast {
    return {
      categoryId: input.categoryId ?? null,
      city: input.city ?? null,
      history,
      projection: [],
      method: 'trailing-28d-daily-mean',
      dataSufficient: false,
      disclaimer: DISCLAIMER,
    };
  }

  /** Customers currently at HIGH churn risk (rule v0, same logic as churnScore). */
  async churnWatchlist(limit = 20): Promise<{
    customers: Array<{
      customerId: string;
      risk: ChurnRisk;
      daysSinceLastBooking: number | null;
      completedBookings: number;
    }>;
    experimental: boolean;
  }> {
    const bookings = await this.prisma.booking.findMany({
      select: { customerId: true },
      take: 10000,
    });
    const ids = [...new Set(bookings.map((b) => b.customerId))].slice(0, 200);
    const scored = [];
    for (const id of ids) {
      try {
        const s = await this.analytics.churnScore(id);
        if (s.risk === 'HIGH') {
          scored.push({
            customerId: id,
            risk: s.risk,
            daysSinceLastBooking: s.daysSinceLastBooking,
            completedBookings: s.completedBookings,
          });
        }
      } catch {
        // one bad customer never breaks the watchlist
      }
    }
    return {
      customers: scored
        .sort((a, b) => (b.daysSinceLastBooking ?? 0) - (a.daysSinceLastBooking ?? 0))
        .slice(0, Math.min(Math.max(limit, 1), 100)),
      experimental: true,
    };
  }
}
