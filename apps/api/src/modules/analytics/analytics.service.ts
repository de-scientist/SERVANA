import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TRACKED_EVENTS, RangeQuery, EventsQuery, TrackAttributionInput } from './dto/analytics.schema';

const KNOWN = new Set<string>(TRACKED_EVENTS as unknown as string[]);

/**
 * Marketplace intelligence foundation. Behavioural events land in
 * AnalyticsEvent with structured payloads (future recommendation/prediction
 * input); money metrics always aggregate authoritative ledger tables, never
 * event counts. track() never throws — analytics must not break product flows.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- capture ------------------------------------------------------------------------

  async track(
    type: string,
    input: { userId?: string | null; payload?: Record<string, unknown> } = {},
  ): Promise<void> {
    try {
      if (!KNOWN.has(type)) {
        this.logger.debug(`Ignoring untracked event type: ${type}`);
        return;
      }
      await this.prisma.analyticsEvent.create({
        data: {
          type,
          payload: (input.payload ?? {}) as any,
          userId: input.userId ?? null,
        },
      });
    } catch (err) {
      this.logger.debug(`track(${type}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * First-touch marketing attribution (utm_* / referral / provider page).
   * Fired by the frontend on landing; revenue is later attributed to each
   * user's earliest touch. Empty touches are ignored.
   */
  async trackAttribution(
    input: TrackAttributionInput & { userId?: string | null },
  ): Promise<{ recorded: boolean }> {
    try {
      const { userId, ...touch } = input;
      const values = Object.values(touch).filter(
        (v) => v !== undefined && v !== null && String(v).trim() !== '',
      );
      if (!values.length && !userId) return { recorded: false };
      await this.prisma.attribution.create({
        data: {
          sessionId: touch.sessionId ?? null,
          userId: userId ?? null,
          utmSource: touch.utmSource ?? null,
          utmMedium: touch.utmMedium ?? null,
          utmCampaign: touch.utmCampaign ?? null,
          utmContent: touch.utmContent ?? null,
          referralCode: touch.referralCode ?? null,
          providerSlug: touch.providerSlug ?? null,
        },
      });
      return { recorded: true };
    } catch (err) {
      this.logger.debug(`trackAttribution failed: ${(err as Error).message}`);
      return { recorded: false };
    }
  }

  // --- admin: purposeful metrics --------------------------------------------------------------
  // Every metric answers a business question (see method docs). All money in
  // minor-unit strings.

  private range(query: RangeQuery): { gte?: Date; lte?: Date } {
    const r: { gte?: Date; lte?: Date } = {};
    if (query.from) r.gte = new Date(query.from);
    if (query.to) r.lte = new Date(query.to);
    return r;
  }

  /** Is the marketplace growing and making money? (revenue, commission, refunds, bookings) */
  async overview(query: RangeQuery) {
    const createdAt = this.range(query);
    const hasRange = Object.keys(createdAt).length > 0;
    const where: any = hasRange ? { createdAt } : {};

    const [payments, commissions, refunds, bookings] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'SUCCESSFUL', ...(hasRange ? { createdAt } : {}) },
        select: { grossCents: true, feeCents: true },
      }),
      this.prisma.commission.findMany({
        where,
        select: { commissionCents: true },
      }),
      this.prisma.refund.findMany({
        where,
        select: { amountCents: true },
      }),
      this.prisma.booking.findMany({
        where: hasRange ? { createdAt } : {},
        select: { status: true, customerId: true },
      }),
    ]);

    const revenue = sum(payments.map((p) => p.grossCents));
    const paymentFees = sum(payments.map((p) => p.feeCents));
    const commission = sum(commissions.map((c) => c.commissionCents));
    const refunded = sum(refunds.map((r) => r.amountCents));

    const completed = bookings.filter((b) => b.status === 'COMPLETED').length;
    const cancelled = bookings.filter((b) => b.status === 'CANCELLED').length;

    // Repeat customers: ≥2 completed bookings / customers with ≥1.
    const completedByCustomer = new Map<string, number>();
    for (const b of bookings) {
      if (b.status !== 'COMPLETED' || !b.customerId) continue;
      completedByCustomer.set(b.customerId, (completedByCustomer.get(b.customerId) ?? 0) + 1);
    }
    const withAny = completedByCustomer.size;
    const repeat = [...completedByCustomer.values()].filter((n) => n >= 2).length;

    return {
      range: { from: query.from ?? null, to: query.to ?? null },
      revenue: {
        grossCents: revenue.toString(),
        payments: payments.length,
        paymentFeesCents: paymentFees.toString(),
        commissionCents: commission.toString(),
        refundedCents: refunded.toString(),
        netCents: (revenue - refunded).toString(),
      },
      bookings: {
        total: bookings.length,
        completed,
        cancelled,
        completionRate: bookings.length ? round2(completed / bookings.length) : 0,
      },
      retention: {
        customersWithBookings: withAny,
        repeatCustomers: repeat,
        repeatRate: withAny ? round2(repeat / withAny) : 0,
      },
    };
  }

  /** Where does the booking funnel leak? (views → intent → booking → payment) */
  async funnel(query: RangeQuery) {
    const createdAt = this.range(query);
    const hasRange = Object.keys(createdAt).length > 0;
    const eventWhere: any = hasRange ? { createdAt } : {};
    const counts = await Promise.all(
      ['SERVICE_VIEWED', 'BOOKING_STARTED', 'BOOKING_CREATED', 'PAYMENT_SUCCESSFUL'].map((type) =>
        this.prisma.analyticsEvent.count({ where: { type, ...eventWhere } }),
      ),
    );
    const [viewed, started, created, paid] = counts;
    return {
      viewed,
      started,
      created,
      paid,
      viewToStart: viewed ? round2(started / viewed) : 0,
      startToCreate: started ? round2(created / started) : 0,
      createToPay: created ? round2(paid / created) : 0,
      overall: viewed ? round2(paid / viewed) : 0,
    };
  }

  /** Which providers drive the marketplace — and who needs help? */
  async providers(query: RangeQuery & { limit?: number }) {
    const createdAt = this.range(query);
    const hasRange = Object.keys(createdAt).length > 0;
    const [payments, reviews] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'SUCCESSFUL', ...(hasRange ? { createdAt } : {}) },
        select: { providerId: true, grossCents: true, commissionCents: true, bookingId: true },
      }),
      this.prisma.review.findMany({
        where: { status: 'APPROVED' as any },
        select: { providerId: true, overall: true },
      }),
    ]);
    const byProvider = new Map<
      string,
      { revenue: bigint; commission: bigint; jobs: number; ratingTotal: number; ratingCount: number }
    >();
    for (const p of payments) {
      if (!p.providerId) continue;
      const row = byProvider.get(p.providerId) ?? { revenue: 0n, commission: 0n, jobs: 0, ratingTotal: 0, ratingCount: 0 };
      row.revenue += p.grossCents;
      row.commission += p.commissionCents;
      if (p.bookingId) row.jobs += 1;
      byProvider.set(p.providerId, row);
    }
    for (const r of reviews) {
      const row = byProvider.get(r.providerId) ?? { revenue: 0n, commission: 0n, jobs: 0, ratingTotal: 0, ratingCount: 0 };
      row.ratingTotal += r.overall;
      row.ratingCount += 1;
      byProvider.set(r.providerId, row);
    }
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const rows = [...byProvider.entries()]
      .map(([providerId, v]) => ({
        providerId,
        revenueCents: v.revenue.toString(),
        commissionCents: v.commission.toString(),
        completedJobs: v.jobs,
        avgRating: v.ratingCount ? round2(v.ratingTotal / v.ratingCount) : 0,
        totalReviews: v.ratingCount,
      }))
      .sort((a, b) => Number(BigInt(b.revenueCents) - BigInt(a.revenueCents)))
      .slice(0, limit);
    return { data: rows };
  }

  /** Is the product shelf working? (units, sales, top sellers) */
  async products(query: RangeQuery) {
    const createdAt = this.range(query);
    const hasRange = Object.keys(createdAt).length > 0;
    const orders = await this.prisma.order.findMany({
      where: hasRange ? { createdAt } : {},
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
    } as any);
    // Only money-confirmed orders count as sales.
    const sold = (orders as any[]).filter((o) =>
      ['PAID', 'PROCESSING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(o.status),
    );
    let units = 0;
    let sales = 0n;
    const byProduct = new Map<string, { name: string; units: number; sales: bigint }>();
    for (const o of sold) {
      for (const i of o.items ?? []) {
        units += i.qty;
        const line = BigInt(i.unitCents) * BigInt(i.qty);
        sales += line;
        const row = byProduct.get(i.productId) ?? { name: i.product?.name ?? i.productId.slice(0, 8), units: 0, sales: 0n };
        row.units += i.qty;
        row.sales += line;
        byProduct.set(i.productId, row);
      }
    }
    const top = [...byProduct.entries()]
      .map(([productId, v]) => ({ productId, name: v.name, units: v.units, salesCents: v.sales.toString() }))
      .sort((a, b) => Number(BigInt(b.salesCents) - BigInt(a.salesCents)))
      .slice(0, 10);
    return {
      orders: sold.length,
      units,
      salesCents: sales.toString(),
      topProducts: top,
    };
  }

  /** Which channels bring customers and money? (first-touch attribution) */
  async attribution(query: RangeQuery) {
    const createdAt = this.range(query);
    const hasRange = Object.keys(createdAt).length > 0;
    const [touches, bookings, payments] = await Promise.all([
      this.prisma.attribution.findMany({
        where: hasRange ? { createdAt } : {},
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.booking.findMany({
        where: { status: 'COMPLETED', ...(hasRange ? { createdAt } : {}) },
        select: { customerId: true },
      }),
      this.prisma.payment.findMany({
        where: { status: 'SUCCESSFUL', ...(hasRange ? { createdAt } : {}) },
        select: { customerId: true, grossCents: true },
      }),
    ]);
    // First touch per user wins.
    const firstTouch = new Map<string, (typeof touches)[number]>();
    for (const t of touches) {
      if (!t.userId || firstTouch.has(t.userId)) continue;
      firstTouch.set(t.userId, t);
    }
    const channelOf = (userId: string | null) => {
      if (!userId) return 'direct';
      const t = firstTouch.get(userId);
      return t?.utmSource?.trim() || 'direct';
    };
    const byChannel = new Map<string, { bookings: number; revenue: bigint; users: Set<string> }>();
    const bump = (channel: string, userId: string | null, revenue: bigint, isBooking: boolean) => {
      const row = byChannel.get(channel) ?? { bookings: 0, revenue: 0n, users: new Set<string>() };
      if (isBooking) row.bookings += 1;
      row.revenue += revenue;
      if (userId) row.users.add(userId);
      byChannel.set(channel, row);
    };
    for (const b of bookings) bump(channelOf(b.customerId), b.customerId, 0n, true);
    for (const p of payments) bump(channelOf(p.customerId), p.customerId, p.grossCents, false);

    const providerViews = new Map<string, number>();
    for (const t of touches) {
      const slug = (t as any).providerSlug;
      if (slug) providerViews.set(slug, (providerViews.get(slug) ?? 0) + 1);
    }

    return {
      channels: [...byChannel.entries()]
        .map(([channel, v]) => ({
          channel,
          users: v.users.size,
          bookings: v.bookings,
          revenueCents: v.revenue.toString(),
        }))
        .sort((a, b) => Number(BigInt(b.revenueCents) - BigInt(a.revenueCents))),
      providerViews: [...providerViews.entries()]
        .map(([providerSlug, views]) => ({ providerSlug, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 20),
    };
  }

  /** Raw event feed for future recommendation/prediction models (capped). */
  async events(query: EventsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: any = {};
    if (query.type) {
      if (!KNOWN.has(query.type)) return { data: [], meta: { page, pageSize, total: 0, pages: 0 } };
      where.type = query.type;
    }
    const range = this.range(query);
    if (Object.keys(range).length) where.createdAt = range;
    const [rows, total] = await Promise.all([
      this.prisma.analyticsEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.analyticsEvent.count({ where }),
    ]);
    return {
      data: rows.map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        userId: e.userId,
        createdAt: e.createdAt,
      })),
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 },
    };
  }
}

function sum(values: bigint[]): bigint {
  return values.reduce((s, v) => s + v, 0n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
