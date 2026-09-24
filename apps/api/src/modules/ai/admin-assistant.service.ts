import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AIService } from './ai.service';

export interface AdminAnswer {
  question: string;
  answer: string;
  data: Record<string, unknown>;
}

/**
 * Admin copilot over CONTROLLED analytics tools. The model never writes SQL
 * and never touches raw tables: the question routes to a fixed aggregation,
 * numbers come from ledger tables, and an LLM (or template fallback) only
 * phrases the summary. Every ask is audit-logged.
 */
@Injectable()
export class AdminAssistantService {
  private readonly logger = new Logger(AdminAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AIService,
  ) {}

  async ask(adminId: string, question: string): Promise<AdminAnswer> {
    const q = question.toLowerCase();
    let answer: AdminAnswer;
    if (/declin|drop|down|fell|fewer|trend/.test(q) && /book/.test(q)) {
      answer = await this.bookingTrend(question);
    } else if (/categor/.test(q) && /grow|fastest|trend|top/.test(q)) {
      answer = await this.categoryGrowth(question);
    } else if (/cancel/.test(q) && /provider/.test(q)) {
      answer = await this.highCancellations(question);
    } else if (/commission/.test(q)) {
      answer = await this.commissionSources(question);
    } else if (/demand|area|city|region|where.*(need|short|more)/.test(q)) {
      answer = await this.demandAreas(question);
    } else if (/churn/.test(q)) {
      answer = await this.churnPicture(question);
    } else if (/revenue|money|earning|sales/.test(q)) {
      answer = await this.revenuePicture(question);
    } else {
      answer = {
        question,
        answer:
          'I can answer: booking trends, fastest-growing categories, providers with high cancellations, commission sources, demand by area, churn, and revenue. Try one of those.',
        data: {},
      };
    }

    await this.audit.record({
      actorId: adminId, action: 'ai.adminAsk', entity: 'adminAssistant', entityId: adminId,
      after: { question: question.slice(0, 300) },
    });
    return answer;
  }

  /** Current 30d vs previous 30d bookings, with completion mix. */
  private async bookingTrend(question: string): Promise<AdminAnswer> {
    const now = Date.now();
    const cur = await this.bookingCounts(new Date(now - 30 * 86_400_000), new Date(now));
    const prev = await this.bookingCounts(new Date(now - 60 * 86_400_000), new Date(now - 30 * 86_400_000));
    const delta = cur.total - prev.total;
    const pct = prev.total ? Math.round((delta / prev.total) * 100) : (cur.total ? 100 : 0);
    const direction = delta < 0 ? 'declined' : delta > 0 ? 'grew' : 'held steady';
    return {
      question,
      answer: `Bookings ${direction} ${Math.abs(pct)}% (last 30d: ${cur.total} vs prior 30d: ${prev.total}). Completions last 30d: ${cur.completed}; cancellations: ${cur.cancelled}.`,
      data: { current: cur, previous: prev, deltaPct: pct },
    };
  }

  private async bookingCounts(from: Date, to: Date) {
    const bookings = await this.prisma.booking.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { status: true, providerServiceId: true },
    });
    return {
      total: bookings.length,
      completed: bookings.filter((b) => b.status === 'COMPLETED').length,
      cancelled: bookings.filter((b) => b.status === 'CANCELLED').length,
    };
  }

  /** Bookings per catalog category, current vs previous 30d. */
  private async categoryGrowth(question: string): Promise<AdminAnswer> {
    const now = Date.now();
    const windows = [
      { from: new Date(now - 30 * 86_400_000), to: new Date(now) },
      { from: new Date(now - 60 * 86_400_000), to: new Date(now - 30 * 86_400_000) },
    ];
    const counts: Array<Map<string, number>> = [];
    for (const w of windows) {
      const bookings = await this.prisma.booking.findMany({
        where: { createdAt: { gte: w.from, lte: w.to } },
        select: { providerService: { select: { categoryId: true } } },
      });
      const m = new Map<string, number>();
      for (const b of bookings) {
        const c = (b as any).providerService?.categoryId;
        if (!c) continue;
        m.set(c, (m.get(c) ?? 0) + 1);
      }
      counts.push(m);
    }
    const [cur, prev] = counts;
    const catIds = new Set([...cur.keys(), ...prev.keys()]);
    const cats = await this.prisma.category.findMany({
      where: { id: { in: [...catIds] } },
      select: { id: true, name: true },
    });
    const names = new Map(cats.map((c) => [c.id, c.name]));
    const rows = [...catIds].map((id) => ({
      categoryId: id,
      name: names.get(id) ?? id.slice(0, 8),
      current: cur.get(id) ?? 0,
      previous: prev.get(id) ?? 0,
      growth: (cur.get(id) ?? 0) - (prev.get(id) ?? 0),
    }));
    rows.sort((a, b) => b.growth - a.growth);
    const top = rows[0];
    return {
      question,
      answer: top
        ? `Fastest-growing category: ${top.name} (${top.previous} → ${top.current} bookings in 30d).`
        : 'No categorized bookings in the window.',
      data: { rows: rows.slice(0, 10) },
    };
  }

  /** Providers ranked by cancellation rate (min 3 bookings to avoid noise). */
  private async highCancellations(question: string): Promise<AdminAnswer> {
    const bookings = await this.prisma.booking.findMany({
      select: { providerId: true, status: true },
      take: 5000,
    });
    const byProvider = new Map<string, { total: number; cancelled: number }>();
    for (const b of bookings) {
      const r = byProvider.get(b.providerId) ?? { total: 0, cancelled: 0 };
      r.total += 1;
      if (b.status === 'CANCELLED') r.cancelled += 1;
      byProvider.set(b.providerId, r);
    }
    const profiles = await this.prisma.providerProfile.findMany({
      where: { id: { in: [...byProvider.keys()] } },
      select: { id: true, businessName: true },
    });
    const names = new Map(profiles.map((p) => [p.id, p.businessName ?? p.id.slice(0, 8)]));
    const rows = [...byProvider.entries()]
      .filter(([, v]) => v.total >= 3 && v.cancelled > 0)
      .map(([id, v]) => ({
        providerId: id,
        name: names.get(id),
        total: v.total,
        cancelled: v.cancelled,
        rate: Math.round((v.cancelled / v.total) * 100) / 100,
      }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total)
      .slice(0, 10);
    return {
      question,
      answer: rows.length
        ? `Highest cancellation rate: ${rows[0].name} at ${Math.round(rows[0].rate * 100)}% (${rows[0].cancelled}/${rows[0].total}).`
        : 'No provider meets the bar (3+ bookings with cancellations).',
      data: { rows },
    };
  }

  /** Commission by provider (top earners for the platform). */
  private async commissionSources(question: string): Promise<AdminAnswer> {
    const commissions = await this.prisma.commission.findMany({
      select: { commissionCents: true, payment: { select: { providerId: true } } },
      take: 5000,
    });
    const byProvider = new Map<string, bigint>();
    for (const c of commissions) {
      const pid = (c as any).payment?.providerId ?? 'platform';
      byProvider.set(pid, (byProvider.get(pid) ?? 0n) + c.commissionCents);
    }
    const rows = [...byProvider.entries()]
      .map(([providerId, cents]) => ({ providerId, commissionCents: cents.toString() }))
      .sort((a, b) => Number(BigInt(b.commissionCents) - BigInt(a.commissionCents)))
      .slice(0, 10);
    const total = rows.reduce((s, r) => s + BigInt(r.commissionCents), 0n);
    return {
      question,
      answer: rows.length
        ? `Top commission source generates KES ${Number(rows[0].commissionCents) / 100} of KES ${Number(total) / 100} total tracked.`
        : 'No commission recorded yet.',
      data: { rows, totalCents: total.toString() },
    };
  }

  /** Demand (bookings) vs supply (verified providers) by city. */
  async demandAreas(question: string): Promise<AdminAnswer> {
    // Bookings carry providerId; cities resolve via the provider map.
    const providers = await this.prisma.providerProfile.findMany({
      where: { status: 'VERIFIED' as any },
      select: { id: true, city: true },
    });
    const byCity = new Map<string, { demand: number; supply: number }>();
    for (const p of providers) {
      const city = (p.city ?? 'Unknown').trim() || 'Unknown';
      const r = byCity.get(city) ?? { demand: 0, supply: 0 };
      r.supply += 1;
      byCity.set(city, r);
    }
    const allBookings = await this.prisma.booking.findMany({
      select: { providerId: true },
      take: 5000,
    });
    const cityOf = new Map(providers.map((p) => [p.id, (p.city ?? 'Unknown').trim() || 'Unknown']));
    for (const b of allBookings) {
      const city = cityOf.get(b.providerId) ?? 'Unknown';
      const r = byCity.get(city) ?? { demand: 0, supply: 0 };
      r.demand += 1;
      byCity.set(city, r);
    }
    const rows = [...byCity.entries()]
      .map(([city, v]) => ({ city, ...v, gap: v.demand - v.supply }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 10);
    const top = rows[0];
    return {
      question,
      answer: top
        ? `Highest demand pressure: ${top.city} (${top.demand} bookings vs ${top.supply} verified providers).`
        : 'No booking geography yet.',
      data: { rows },
    };
  }

  /** Churn distribution across customers with history. */
  private async churnPicture(question: string): Promise<AdminAnswer> {
    const bookings = await this.prisma.booking.findMany({
      select: { customerId: true, status: true, startsAt: true },
      take: 5000,
    });
    const byCustomer = new Map<string, { completed: number; last: number }>();
    for (const b of bookings) {
      const r = byCustomer.get(b.customerId) ?? { completed: 0, last: 0 };
      if (b.status === 'COMPLETED') r.completed += 1;
      r.last = Math.max(r.last, b.startsAt.getTime());
      byCustomer.set(b.customerId, r);
    }
    let high = 0;
    let medium = 0;
    const now = Date.now();
    for (const v of byCustomer.values()) {
      const days = Math.floor((now - v.last) / 86_400_000);
      if (v.completed >= 2 && days > 90) high += 1;
      else if (days > 45) medium += 1;
    }
    return {
      question,
      answer: `${high} high-risk and ${medium} medium-risk customers (habituals gone quiet 90d+/45d+).`,
      data: { high, medium, tracked: byCustomer.size },
    };
  }

  /** Revenue, commission and refunds to date. */
  private async revenuePicture(question: string): Promise<AdminAnswer> {
    const [payments, refunds] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'SUCCESSFUL' },
        select: { grossCents: true, commissionCents: true },
      }),
      this.prisma.refund.findMany({ select: { amountCents: true } }),
    ]);
    const gross = payments.reduce((s, p) => s + p.grossCents, 0n);
    const commission = payments.reduce((s, p) => s + p.commissionCents, 0n);
    const refunded = refunds.reduce((s, r) => s + r.amountCents, 0n);
    return {
      question,
      answer: `Gross KES ${Number(gross) / 100}, commission KES ${Number(commission) / 100}, refunded KES ${Number(refunded) / 100} across ${payments.length} successful payments.`,
      data: {
        grossCents: gross.toString(),
        commissionCents: commission.toString(),
        refundedCents: refunded.toString(),
        payments: payments.length,
      },
    };
  }
}
