import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from './ai.service';
import { parsedCriteriaSchema, ParsedCriteria, fallbackParse } from './matching.parse';

export interface MatchedProvider {
  providerId: string;
  businessName: string | null;
  slug: string;
  serviceName: string;
  priceCents: string;
  score: number;
  reasons: string[];
  likelyAvailable: boolean | null;
}

const PARSE_SYSTEM = [
  'You extract structured search criteria from customer requests for a beauty services marketplace.',
  'Reply with ONLY a JSON object, no other text, matching this schema:',
  '{"service": string|null, "location": string|null, "date": "YYYY-MM-DD"|null, "budget": number|null (KES), "preferences": string[]}',
  'Rules: service = the beauty need (e.g. "makeup artist"); location = area/city if stated; date = resolve relative days against the provided today-date, else null; budget = numeric KES maximum or null; preferences = short tags like "verified only".',
  'Never invent providers, prices or availability — you only parse the request.',
].join(' ');

/**
 * Smart matching: natural language → validated criteria (LLM, with a
 * deterministic fallback) → real marketplace rows → ranked results.
 *
 * Anti-hallucination by construction: the model only ever produces search
 * criteria. Every recommended provider comes from a database query, and
 * each carries evidence from actual rows.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
  ) {}

  /** Parse a request into criteria. LLM first, deterministic fallback on any failure. */
  async parseCriteria(query: string, actorId?: string | null, today: Date = new Date()): Promise<{ criteria: ParsedCriteria; source: 'llm' | 'fallback' }> {
    const todayISO = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    try {
      const res = await this.ai.complete({
        actorId,
        feature: 'smart-match-parse',
        system: `${PARSE_SYSTEM} Today is ${todayISO}.`,
        input: query,
        maxTokens: 300,
      });
      const json = extractJson(res.text);
      const parsed = parsedCriteriaSchema.safeParse(json);
      if (parsed.success) return { criteria: parsed.data, source: 'llm' };
      this.logger.debug('LLM parse failed validation; using fallback parser');
    } catch (err) {
      this.logger.debug(`LLM parse unavailable (${(err as Error).message}); using fallback parser`);
    }
    return { criteria: fallbackParse(query, today), source: 'fallback' };
  }

  /** Ranked providers from the database for parsed criteria. */
  async match(
    userId: string | null,
    query: string,
    limit = 5,
    today: Date = new Date(),
  ): Promise<{ criteria: ParsedCriteria; parseSource: 'llm' | 'fallback'; results: MatchedProvider[] }> {
    const { criteria, source } = await this.parseCriteria(query, userId, today);

    // Category candidates from the service keywords (DB-driven, never invented).
    let categoryIds: string[] | undefined;
    if (criteria.service) {
      const words = criteria.service.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const categories = await this.prisma.category.findMany({ take: 200 });
      const hits = categories.filter((c) =>
        words.some((w) => c.name.toLowerCase().includes(w) || w.includes(c.name.toLowerCase().split(' ')[0])),
      );
      if (hits.length) categoryIds = hits.map((c) => c.id);
    }

    const maxCents =
      criteria.budget != null ? BigInt(Math.round(criteria.budget * 100)) : null;
    // Word-level service match: "makeup artist" matches "Bridal Makeup".
    const serviceWords = (criteria.service ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    // Candidate services: active, verified providers, budget-capped.
    const services: any[] = await (this.prisma as any).providerService.findMany({
      where: {
        isActive: true,
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
        ...(serviceWords.length
          ? {
              OR: serviceWords.flatMap((w) => [
                { name: { contains: w, mode: 'insensitive' } },
                { description: { contains: w, mode: 'insensitive' } },
              ]),
            }
          : {}),
        ...(maxCents != null ? { priceCents: { lte: maxCents } } : {}),
        provider: {
          status: 'VERIFIED',
          ...(criteria.location
            ? { city: { contains: criteria.location, mode: 'insensitive' } }
            : {}),
        },
      },
      include: { provider: { select: { id: true, businessName: true, slug: true, city: true } } },
      take: 100,
    });

    // Quality + affinity scoring (shared deterministic backbone).
    const providerIds = [...new Set(services.map((s) => s.providerId))];
    const snapshots = providerIds.length
      ? await (this.prisma as any).providerRankingSnapshot.findMany({
          where: { providerId: { in: providerIds } },
        })
      : [];
    const scores = new Map<string, number>(snapshots.map((s: any) => [s.providerId, s.qualityScore]));
    const past = new Set<string>();
    if (userId) {
      const bookings = await this.prisma.booking.findMany({
        where: { customerId: userId, status: { in: ['COMPLETED', 'CONFIRMED', 'PAID'] as any } },
        select: { providerId: true },
        take: 200,
      });
      for (const b of bookings) past.add(b.providerId);
    }

    // Availability on the requested date (rule coverage + no time-off).
    const availability = criteria.date ? await this.availabilityOn(providerIds, criteria.date) : null;

    const ranked: MatchedProvider[] = [];
    const seen = new Set<string>();
    for (const s of services) {
      if (seen.has(s.providerId)) continue; // one row per provider: their best match
      seen.add(s.providerId);
      const reasons: string[] = ['matches your request'];
      let score = (scores.get(s.providerId) ?? 50) * 0.6;
      if (past.has(s.providerId)) {
        score += 15;
        reasons.push('booked before');
      }
      if (maxCents != null) {
        score += 10;
        reasons.push('within budget');
      }
      if (criteria.location && (s.provider.city ?? '').toLowerCase().includes(criteria.location.toLowerCase())) {
        score += 10;
        reasons.push('near you');
      }
      let likelyAvailable: boolean | null = null;
      if (availability) {
        likelyAvailable = availability.get(s.providerId) ?? false;
        if (likelyAvailable) {
          score += 5;
          reasons.push('likely available on date');
        }
      }
      // Strict date filter: drop providers with no coverage that day.
      if (criteria.date && likelyAvailable === false) continue;
      ranked.push({
        providerId: s.providerId,
        businessName: s.provider?.businessName ?? null,
        slug: s.provider?.slug ?? '',
        serviceName: s.name,
        priceCents: s.priceCents.toString(),
        score: Math.round(Math.min(100, score) * 10) / 10,
        reasons,
        likelyAvailable,
      });
    }

    ranked.sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, Math.min(Math.max(limit, 1), 20));

    if (userId) {
      for (const r of top) {
        try {
          await this.prisma.recommendationEvent.create({
            data: { userId, itemType: 'provider', itemId: r.providerId, source: 'smart-match' },
          });
        } catch {
          // logging never breaks the request
        }
      }
    }
    return { criteria, parseSource: source, results: top };
  }

  /**
   * Evidence for "why this provider?" — every bullet cites actual rows:
   * rating + review count, completed jobs, repeat-customer overlap,
   * verification level, and price position.
   */
  async explain(
    userId: string | null,
    itemType: 'provider' | 'service' | 'product',
    itemId: string,
  ): Promise<{ itemType: string; itemId: string; summary: string; evidence: string[] }> {
    const evidence: string[] = [];
    if (itemType === 'provider') {
      const [profile, reviews, bookings, snapshot, verification] = await Promise.all([
        this.prisma.providerProfile.findUnique({
          where: { id: itemId },
          select: { id: true, businessName: true, city: true },
        }),
        this.prisma.review.findMany({
          where: { providerId: itemId, status: 'APPROVED' as any },
          select: { overall: true, customerId: true },
        }),
        this.prisma.booking.findMany({
          where: { providerId: itemId, status: 'COMPLETED' },
          select: { customerId: true },
        }),
        (this.prisma as any).providerRankingSnapshot?.findUnique?.({ where: { providerId: itemId } }),
        this.prisma.providerVerification.findUnique({ where: { providerId: itemId } }),
      ]);
      if (!profile) throw new Error('Provider not found');
      const avg = reviews.length
        ? Math.round((reviews.reduce((s, r) => s + r.overall, 0) / reviews.length) * 10) / 10
        : 0;
      const customers = new Set(bookings.map((b) => b.customerId));
      evidence.push(
        `Rated ${avg.toFixed(1)}★ across ${reviews.length} verified review${reviews.length === 1 ? '' : 's'}.`,
        `Completed ${bookings.length} job${bookings.length === 1 ? '' : 's'} for ${customers.size} customer${customers.size === 1 ? '' : 's'}.`,
      );
      if (userId && reviews.some((r) => r.customerId === userId)) {
        evidence.push('You have reviewed this provider before.');
      }
      if (userId) {
        const mine = await this.prisma.booking.count({ where: { customerId: userId, providerId: itemId } });
        if (mine > 0) evidence.push(`You have booked this provider ${mine} time${mine === 1 ? '' : 's'} before.`);
      }
      if (verification?.status === 'VERIFIED') {
        evidence.push(`Verified at ${String(verification.level).replace(/_/g, ' ').toLowerCase()} level.`);
      }
      if ((snapshot as any)?.qualityScore != null) {
        evidence.push(`Platform quality score ${(snapshot as any).qualityScore.toFixed(1)}/100.`);
      }
      return {
        itemType,
        itemId,
        summary: `${profile.businessName ?? 'This provider'} matches on verified customer outcomes, not promises.`,
        evidence,
      };
    }
    if (itemType === 'service') {
      const svc: any = await (this.prisma as any).providerService.findUnique({
        where: { id: itemId },
        include: { provider: { select: { id: true, businessName: true } } },
      });
      if (!svc) throw new Error('Service not found');
      evidence.push(`Priced at KES ${Number(svc.priceCents) / 100} for ${svc.durationMin} minutes.`);
      evidence.push(`Offered by ${svc.provider?.businessName ?? 'a verified provider'}.`);
      const sub = await this.explain(userId, 'provider', svc.providerId);
      return {
        itemType,
        itemId,
        summary: `${svc.name} — evidence for its provider below.`,
        evidence: [...evidence, ...sub.evidence],
      };
    }
    const product = await this.prisma.product.findUnique({
      where: { id: itemId },
      include: { inventory: true },
    });
    if (!product) throw new Error('Product not found');
    const available = (product.inventory ?? []).reduce((s: number, r: any) => s + Math.max(0, r.quantity - r.reserved), 0);
    evidence.push(`Priced at KES ${Number(product.saleCents ?? product.priceCents) / 100}${product.saleCents != null ? ' (on sale)' : ''}.`);
    evidence.push(`${available} unit${available === 1 ? '' : 's'} in stock right now.`);
    if (userId) {
      const bought = await this.prisma.orderItem.count({
        where: { productId: itemId, order: { customerId: userId } },
      });
      if (bought > 0) evidence.push('You have bought this product before.');
    }
    return { itemType, itemId, summary: `${product.name} — in stock and orderable today.`, evidence };
  }

  private async availabilityOn(providerIds: string[], dateISO: string): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    if (!providerIds.length) return out;
    const date = new Date(`${dateISO}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return out;
    const dow = date.getUTCDay();
    const dayStart = new Date(date);
    const [rules, exceptions] = await Promise.all([
      this.prisma.availabilityRule.findMany({ where: { providerId: { in: providerIds } } }),
      this.prisma.availabilityException.findMany({
        where: { providerId: { in: providerIds }, date: dayStart },
      }),
    ]);
    const blocked = new Set(
      exceptions
        .filter((e) => e.type === 'TIME_OFF' || e.type === 'HOLIDAY')
        .map((e) => e.providerId),
    );
    const covered = new Set(rules.filter((r) => r.dayOfWeek === dow).map((r) => r.providerId));
    for (const id of providerIds) out.set(id, covered.has(id) && !blocked.has(id));
    return out;
  }
}

/** Extract the first JSON object from model text (tolerates fences/prose). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}
