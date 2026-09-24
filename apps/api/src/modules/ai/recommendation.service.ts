import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTool } from './ai-tools';
import { RecommendProvidersInput } from './dto/ai.schema';

export interface RankedProvider {
  providerId: string;
  businessName: string | null;
  slug: string;
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

    // Past relationship: providers this customer already booked.
    const past = new Set<string>();
    if (userId) {
      const bookings = await this.prisma.booking.findMany({
        where: { customerId: userId, status: { in: ['COMPLETED', 'CONFIRMED', 'PAID'] as any } },
        select: { providerId: true },
        take: 200,
      });
      for (const b of bookings) past.add(b.providerId);
    }

    // Quality snapshots for score-aware ranking.
    const snapshots = await (this.prisma as any).providerRankingSnapshot.findMany({
      where: { providerId: { in: pool.map((p) => p.id) } },
    });
    const scores = new Map<string, number>(snapshots.map((s: any) => [s.providerId, s.qualityScore]));

    const ranked: RankedProvider[] = pool.map((p) => {
      const reasons: string[] = [];
      let score = (scores.get(p.id) ?? 50) * 0.7; // quality backbone (0–70)
      reasons.push('quality score');
      if (past.has(p.id)) {
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

    // Training data for future models: what we showed, to whom, why, from where.
    if (userId) {
      for (const r of top) {
        try {
          await this.prisma.recommendationEvent.create({
            data: {
              userId,
              itemType: 'provider',
              itemId: r.providerId,
              source: 'deterministic-v1',
            },
          });
        } catch {
          // recommendation logging never breaks the request
        }
      }
    }
    return top;
  }
}
