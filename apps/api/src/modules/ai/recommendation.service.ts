import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTool } from './ai-tools';
import { RecommendProvidersInput, RecommendServicesInput, RecommendProductsInput } from './dto/ai.schema';

export interface RankedProvider {
  providerId: string;
  businessName: string | null;
  slug: string;
  score: number;
  reasons: string[];
}

export interface RankedService {
  serviceId: string;
  providerServiceId: string;
  name: string;
  providerId: string;
  providerName: string | null;
  priceCents: string;
  score: number;
  reasons: string[];
}

export interface RankedProduct {
  productId: string;
  name: string;
  effectiveCents: string;
  score: number;
  reasons: string[];
}

/**
 * Deterministic recommendation foundation (v1): business rules first —
 * quality snapshots, category match, repeat-provider affinity — with every
 * suggestion logged as a RecommendationEvent. ML reranking plugs in later
 * WITHOUT changing the API: same inputs, same logged outcomes.
 */
@Injectable()
export class RecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  async recommendProviders(
    userId: string | null,
    input: RecommendProvidersInput,
  ): Promise<RankedProvider[]> {
    const limit = input.limit ?? 5;

    // Candidate pool: verified providers, narrowed by category when known.
    const searchTool = getTool(this.prisma, 'search_providers');
    const pool: any[] = (await searchTool.run({
      categoryId: input.categoryId,
      city: input.city,
      limit: 50,
    })) as any[];

    const past = await this.pastAffinity(userId);
    const scores = await this.qualityMap(pool.map((p) => p.id));

    const ranked: RankedProvider[] = pool.map((p) => {
      const reasons: string[] = [];
      let score = (scores.get(p.id) ?? 50) * 0.7; // quality backbone (0–70)
      reasons.push('quality score');
      if (past.providers.has(p.id)) {
        score += 20;
        reasons.push('booked before');
      }
      if (p.verification?.status === 'VERIFIED') {
        score += 10;
        reasons.push('verified');
      }
      return {
        providerId: p.id,
        businessName: p.businessName,
        slug: p.slug,
        score: Math.round(Math.min(100, score) * 10) / 10,
        reasons,
      };
    });

    ranked.sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, limit);

    await this.logRecommendations(userId, 'provider', top.map((r) => r.providerId));
    return top;
  }

  /**
   * Service recommendations: bookable provider services ranked by provider
   * quality + repeat affinity + budget fit. Only active services of verified
   * providers are ever candidates.
   */
  async recommendServices(
    userId: string | null,
    input: RecommendServicesInput,
  ): Promise<RankedService[]> {
    const limit = input.limit ?? 5;
    const maxCents = input.maxPrice != null ? BigInt(Math.round(input.maxPrice * 100)) : null;

    const pool: any[] = await (this.prisma as any).providerService.findMany({
      where: {
        isActive: true,
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(maxCents != null ? { priceCents: { lte: maxCents } } : {}),
        provider: {
          status: 'VERIFIED',
          ...(input.city ? { city: { contains: input.city, mode: 'insensitive' } } : {}),
        },
      },
      include: { provider: { select: { id: true, businessName: true } } },
      take: 100,
    });

    const past = await this.pastAffinity(userId);
    const scores = await this.qualityMap(pool.map((s) => s.providerId));

    const ranked: RankedService[] = pool.map((s) => {
      const reasons: string[] = [];
      let score = (scores.get(s.providerId) ?? 50) * 0.6;
      reasons.push('provider quality');
      if (past.providers.has(s.providerId)) {
        score += 20;
        reasons.push('booked before');
      }
      if (past.services.has(s.serviceId ?? s.id)) {
        score += 10;
        reasons.push('same service before');
      }
      if (maxCents != null) {
        score += 10;
        reasons.push('within budget');
      }
      return {
        serviceId: s.serviceId ?? s.id,
        providerServiceId: s.id,
        name: s.name,
        providerId: s.providerId,
        providerName: s.provider?.businessName ?? null,
        priceCents: s.priceCents.toString(),
        score: Math.round(Math.min(100, score) * 10) / 10,
        reasons,
      };
    });

    ranked.sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, limit);
    await this.logRecommendations(userId, 'service', top.map((r) => r.providerServiceId));
    return top;
  }

  /**
   * Product recommendations: stocked active products ranked by category
   * affinity (past purchases + booked service categories) + sale bonus.
   */
  async recommendProducts(
    userId: string | null,
    input: RecommendProductsInput,
  ): Promise<RankedProduct[]> {
    const limit = input.limit ?? 5;

    const pool: any[] = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      },
      include: { inventory: true },
      take: 100,
    });
    const stocked = pool.filter((p) =>
      (p.inventory ?? []).some((r: any) => r.quantity - r.reserved > 0),
    );

    // Category affinity from real history: purchased + booked-service categories.
    const affinity = new Set<string>();
    if (userId) {
      const orders = await this.prisma.order.findMany({
        where: { customerId: userId, status: { notIn: ['CANCELLED', 'REFUNDED'] as any } },
        include: { items: { include: { product: { select: { categoryId: true } } } } },
        take: 50,
      });
      for (const o of orders) {
        for (const i of (o as any).items ?? []) {
          if (i.product?.categoryId) affinity.add(i.product.categoryId);
        }
      }
      const bookings = await this.prisma.booking.findMany({
        where: { customerId: userId },
        select: { providerService: { select: { categoryId: true } } },
        take: 50,
      });
      for (const b of bookings) {
        const c = (b as any).providerService?.categoryId;
        if (c) affinity.add(c);
      }
    }

    const ranked: RankedProduct[] = stocked.map((p) => {
      const reasons: string[] = [];
      let score = 50;
      if (p.categoryId && affinity.has(p.categoryId)) {
        score += 30;
        reasons.push('matches your interests');
      }
      if (p.saleCents != null) {
        score += 10;
        reasons.push('on sale');
      }
      score += 10; // in stock and orderable
      reasons.push('in stock');
      const effective = (p.saleCents ?? p.priceCents) as bigint;
      return {
        productId: p.id,
        name: p.name,
        effectiveCents: (effective as bigint).toString(),
        score: Math.round(Math.min(100, score) * 10) / 10,
        reasons,
      };
    });

    ranked.sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, limit);
    await this.logRecommendations(userId, 'product', top.map((r) => r.productId));
    return top;
  }

  // --- shared helpers ------------------------------------------------------------------

  private async pastAffinity(userId: string | null): Promise<{ providers: Set<string>; services: Set<string> }> {
    const providers = new Set<string>();
    const services = new Set<string>();
    if (!userId) return { providers, services };
    const bookings = await this.prisma.booking.findMany({
      where: { customerId: userId, status: { in: ['COMPLETED', 'CONFIRMED', 'PAID'] as any } },
      select: { providerId: true, providerServiceId: true, serviceId: true },
      take: 200,
    });
    for (const b of bookings) {
      providers.add(b.providerId);
      services.add(b.serviceId ?? b.providerServiceId);
    }
    return { providers, services };
  }

  private async qualityMap(providerIds: string[]): Promise<Map<string, number>> {
    if (!providerIds.length) return new Map();
    const snapshots = await (this.prisma as any).providerRankingSnapshot.findMany({
      where: { providerId: { in: providerIds } },
    });
    return new Map<string, number>(snapshots.map((s: any) => [s.providerId, s.qualityScore]));
  }

  private async logRecommendations(userId: string | null, itemType: string, itemIds: string[]) {
    // Training data for future models: what we showed, to whom, why, from where.
    if (!userId) return;
    for (const itemId of itemIds) {
      try {
        await this.prisma.recommendationEvent.create({
          data: { userId, itemType, itemId, source: 'deterministic-v1' },
        });
      } catch {
        // recommendation logging never breaks the request
      }
    }
  }
}
