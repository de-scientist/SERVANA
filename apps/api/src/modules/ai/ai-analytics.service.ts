import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from './ai.service';

export type ChurnRisk = 'LOW' | 'MEDIUM' | 'HIGH';

const POSITIVE_THEMES: Record<string, string[]> = {
  Professionalism: ['professional', 'polite', 'respectful', 'courteous', 'friendly'],
  Quality: ['quality', 'excellent', 'amazing', 'perfect', 'beautiful', 'great'],
  Communication: ['communicat', 'responsive', 'listened', 'explained'],
  Punctuality: ['punctual', 'on time', 'ontime', 'early', 'prompt'],
  Value: ['worth', 'value', 'affordable', 'reasonable', 'fair price'],
};

const NEGATIVE_THEMES: Record<string, string[]> = {
  Punctuality: ['late', 'delayed', 'waited', 'waiting', 'no-show', 'noshow'],
  Quality: ['poor', 'bad', 'disappoint', 'terrible', 'awful', 'messy'],
  Communication: ['rude', 'ignored', 'unresponsive', 'ghosted'],
  Value: ['overpriced', 'expensive', 'overcharged', 'waste'],
  Professionalism: ['unprofessional', 'dirty', 'messy salon', 'smelled'],
};

/**
 * Deterministic analytics that later become ML features/targets:
 * churn risk (rules v0), review themes (counted keywords, never invented),
 * marketing drafts (guardrailed LLM with deterministic fallback).
 */
@Injectable()
export class AIAnalyticsService {
  private readonly logger = new Logger(AIAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
  ) {}

  /**
   * Churn risk v0 (rules, auditable): recency + frequency + cancellations.
   * Output feeds retention workflows today, trains predictors tomorrow.
   */
  async churnScore(userId: string): Promise<{
    risk: ChurnRisk;
    daysSinceLastBooking: number | null;
    completedBookings: number;
    cancellations: number;
    reviews: number;
  }> {
    const [bookings, reviews] = await Promise.all([
      this.prisma.booking.findMany({
        where: { customerId: userId },
        select: { status: true, startsAt: true },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.review.count({ where: { customerId: userId } }),
    ]);
    const completed = bookings.filter((b) => b.status === 'COMPLETED');
    const cancellations = bookings.filter((b) => b.status === 'CANCELLED').length;
    const last = bookings.length
      ? Math.max(...bookings.map((b) => b.startsAt.getTime()))
      : null;
    const daysSince = last == null ? null : Math.floor((Date.now() - last) / 86_400_000);

    let risk: ChurnRisk = 'LOW';
    if (last == null) {
      risk = bookings.length ? 'MEDIUM' : 'LOW'; // never booked → not churning
    } else if (completed.length >= 2 && daysSince! > 90) {
      risk = 'HIGH'; // habitual customer gone quiet
    } else if (daysSince! > 45) {
      risk = 'MEDIUM';
    }
    if (cancellations >= 3 && completed.length === 0) risk = 'HIGH';

    return {
      risk,
      daysSinceLastBooking: daysSince,
      completedBookings: completed.length,
      cancellations,
      reviews,
    };
  }

  /**
   * Review themes counted from actual approved review bodies + dimension
   * averages. No fabrication: every theme carries its mention count.
   */
  async reviewInsights(providerId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { providerId, status: 'APPROVED' as any },
      include: { dimensions: true },
    });
    const bodies = reviews.map((r) => `${r.title ?? ''} ${r.body ?? ''}`.toLowerCase());

    const countTheme = (words: string[]) =>
      bodies.filter((b) => words.some((w) => b.includes(w))).length;

    const strengths: Array<{ theme: string; mentions: number }> = [];
    const improvements: Array<{ theme: string; mentions: number }> = [];
    for (const [theme, words] of Object.entries(POSITIVE_THEMES)) {
      const n = countTheme(words);
      if (n > 0) strengths.push({ theme, mentions: n });
    }
    for (const [theme, words] of Object.entries(NEGATIVE_THEMES)) {
      const n = countTheme(words);
      if (n > 0) improvements.push({ theme, mentions: n });
    }
    strengths.sort((a, b) => b.mentions - a.mentions);
    improvements.sort((a, b) => b.mentions - a.mentions);

    const dimSums = new Map<string, { total: number; n: number }>();
    for (const r of reviews) {
      for (const d of (r as any).dimensions ?? []) {
        const prev = dimSums.get(d.name) ?? { total: 0, n: 0 };
        prev.total += d.score;
        prev.n += 1;
        dimSums.set(d.name, prev);
      }
    }
    const dimensionAverages: Record<string, number> = {};
    for (const [k, v] of dimSums) dimensionAverages[k] = Math.round((v.total / v.n) * 10) / 10;

    const avg = reviews.length
      ? Math.round((reviews.reduce((s, r) => s + r.overall, 0) / reviews.length) * 10) / 10
      : 0;

    return {
      providerId,
      reviewCount: reviews.length,
      avgOverall: avg,
      strengths: strengths.slice(0, 5),
      improvements: improvements.slice(0, 5),
      dimensionAverages,
      generatedFrom: 'approved reviews only',
    };
  }

  /**
   * Marketing copy draft. Public provider data only; output length-checked;
   * deterministic template fallback keeps providers unblocked if the model
   * fails or returns junk.
   */
  async marketingDraft(
    actorId: string,
    providerId: string,
    input: { topic: string; tone: string },
  ): Promise<{ caption: string; hashtags: string[]; source: 'ai' | 'template' }> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      select: { businessName: true, tagline: true, city: true },
    });
    const fallback = {
      caption: `${profile?.businessName ?? 'Glow'} — ${input.topic}. Book your seat today!`,
      hashtags: ['#servana', '#beauty', `#${(profile?.city ?? 'nairobi').toLowerCase().replace(/\s+/g, '')}`],
      source: 'template' as const,
    };
    try {
      const res = await this.ai.complete({
        actorId,
        feature: 'marketing-copy',
        system: `You write short social captions for beauty businesses. Tone: ${input.tone}. Max 280 chars, no hashtags in caption, no personal data, no medical claims.`,
        input: input.topic,
        context: {
          businessName: profile?.businessName ?? null,
          tagline: profile?.tagline ?? null,
          city: profile?.city ?? null,
        },
        maxTokens: 300,
      });
      const caption = res.text.trim().slice(0, 280);
      if (!caption) return fallback;
      return { caption, hashtags: fallback.hashtags, source: 'ai' };
    } catch (err) {
      this.logger.warn(`marketingDraft fallback: ${(err as Error).message}`);
      return fallback;
    }
  }

  /**
   * Provider assistant outputs. DRAFTS ONLY — nothing here publishes,
   * sends, or posts anything. The provider reviews the text and publishes
   * it themselves through their own channels.
   */
  async serviceDescription(
    actorId: string,
    providerId: string,
    input: { serviceName: string; tone: string },
  ): Promise<{ text: string; source: 'ai' | 'template' }> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      select: { businessName: true, city: true, yearsExperience: true },
    });
    const name = input.serviceName.trim().slice(0, 120);
    const fallback = {
      text: `${name} at ${profile?.businessName ?? 'our studio'}${profile?.city ? ` in ${profile.city}` : ''}. Professional products, careful prep and a finish you will love. Book your appointment today!`,
      source: 'template' as const,
    };
    try {
      const res = await this.ai.complete({
        actorId,
        feature: 'service-description',
        system: `You write service-menu descriptions for beauty businesses. Tone: ${input.tone}. 2-3 sentences, max 500 chars, no prices, no personal data, no medical claims, no superlatives you cannot verify.`,
        input: name,
        context: { businessName: profile?.businessName ?? null, city: profile?.city ?? null },
        maxTokens: 300,
      });
      const text = res.text.trim().slice(0, 500);
      if (!text) return fallback;
      return { text, source: 'ai' };
    } catch (err) {
      this.logger.warn(`serviceDescription fallback: ${(err as Error).message}`);
      return fallback;
    }
  }

  /**
   * Promotion / WhatsApp message drafts. Same contract: text only, the
   * provider approves and sends it themselves.
   */
  async promotionMessage(
    actorId: string,
    providerId: string,
    input: { offer: string; channel: 'instagram' | 'whatsapp'; tone: string },
  ): Promise<{ text: string; source: 'ai' | 'template' }> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      select: { businessName: true },
    });
    const offer = input.offer.trim().slice(0, 300);
    const fallback = {
      text:
        input.channel === 'whatsapp'
          ? `Hi! ${profile?.businessName ?? 'We'} have a treat for you: ${offer}. Reply to book your slot!`
          : `${offer} — only at ${profile?.businessName ?? 'us'}. Limited slots, book now!`,
      source: 'template' as const,
    };
    try {
      const res = await this.ai.complete({
        actorId,
        feature: 'promotion-copy',
        system: `You write short promotional messages for beauty businesses (${input.channel}). Tone: ${input.tone}. Max 280 chars, include a booking call-to-action, no personal data, no false scarcity ("only 1 left" style lies).`,
        input: offer,
        context: { businessName: profile?.businessName ?? null },
        maxTokens: 300,
      });
      const text = res.text.trim().slice(0, 280);
      if (!text) return fallback;
      return { text, source: 'ai' };
    } catch (err) {
      this.logger.warn(`promotionMessage fallback: ${(err as Error).message}`);
      return fallback;
    }
  }

  /**
   * Plain-language performance explainer built from the provider's real
   * ranking snapshot + review stats (no model call, cannot hallucinate).
   */
  async performanceExplainer(providerId: string): Promise<{ summary: string; bullets: string[] }> {
    const [snapshot, reviews, bookings] = await Promise.all([
      (this.prisma as any).providerRankingSnapshot?.findUnique?.({ where: { providerId } }),
      this.prisma.review.findMany({
        where: { providerId, status: 'APPROVED' as any },
        select: { overall: true },
      }),
      this.prisma.booking.findMany({ where: { providerId }, select: { status: true } }),
    ]);
    const bullets: string[] = [];
    const completed = bookings.filter((b) => b.status === 'COMPLETED').length;
    const cancelled = bookings.filter((b) => b.status === 'CANCELLED').length;
    const avg = reviews.length
      ? Math.round((reviews.reduce((s, r) => s + r.overall, 0) / reviews.length) * 10) / 10
      : 0;
    bullets.push(`Quality score ${Number((snapshot as any)?.qualityScore ?? 0).toFixed(1)}/100.`);
    bullets.push(`${completed} completed jobs, ${cancelled} cancellations, ${reviews.length} verified reviews at ${avg.toFixed(1)} stars.`);
    if (cancelled > completed && completed + cancelled > 0) {
      bullets.push('Cancellations outnumber completions — protecting confirmed slots would lift the score fastest.');
    } else if (reviews.length < 5) {
      bullets.push('Few verified reviews so far — each new review moves the rating component noticeably.');
    } else {
      bullets.push('Solid review base — repeat bookings now move the needle most.');
    }
    return {
      summary: 'Your score blends rating, completed jobs, repeat business, cancellations, responsiveness, punctuality and verification.',
      bullets,
    };
  }
}
