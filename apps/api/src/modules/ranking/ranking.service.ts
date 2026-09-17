import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppLoggerService } from '../../common/logging/logger.service';
import { RankingWeights } from '../reviews/dtos/review.schema';

export interface ProviderRanking {
  providerId: string;
  qualityScore: number;
  components: RankingComponent[];
  signals: ProviderSignals;
  computedAt: Date;
}

export interface RankingComponent {
  name: string;
  rawValue: number;
  normalizedScore: number;
  weight: number;
  weightedScore: number;
  confidence: number;
}

export interface ProviderSignals {
  overallRating: number;
  totalReviews: number;
  completedJobs: number;
  repeatRate: number;
  cancellationRate: number;
  responseRate: number;
  onTimeRate: number;
  verificationLevel: string | null;
  verificationScore: number;
  profileCompleteness: number;
  totalCustomers: number;
  totalBookings: number;
}

export interface ProviderDashboard {
  ranking: ProviderRanking;
  signals: ProviderSignals;
  trustSignals: TrustSignals;
  insights: PerformanceInsights;
}

export interface TrustSignals {
  rating: number;
  customersServed: number;
  completionRate: number;
  responseRate: number;
  verified: boolean;
}

export interface PerformanceInsights {
  strengths: string[];
  improvements: string[];
  dimensionAverages: Record<string, number>;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  customerRating: 0.3,
  completedJobs: 0.2,
  repeatRate: 0.15,
  cancellationRate: 0.1,
  responseRate: 0.1,
  onTimeRate: 0.1,
  verificationProfile: 0.05,
};

const BAYESIAN_SAMPLE_THRESHOLD = 5;
const BAYESIAN_GLOBAL_MEAN = 3.5;
const BAYESIAN_CONFIDENCE = 5;

@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly logger: AppLoggerService,
  ) {}

  async calculate(providerId: string): Promise<ProviderRanking> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: providerId },
      include: { verification: { select: { level: true, status: true } } },
    });
    if (!profile) throw new Error('Provider profile not found');

    const stats = await this.computeStats(providerId);
    const weights = DEFAULT_WEIGHTS;
    const components = await this.computeComponents(providerId, stats, weights);

    const qualityScore = components.reduce(
      (sum, c) => sum + c.weightedScore * c.weight,
      0,
    );

    const ranking: ProviderRanking = {
      providerId,
      qualityScore: Math.round(qualityScore * 100) / 100,
      components,
      signals: stats,
      computedAt: new Date(),
    };

    await this.prisma.providerRankingSnapshot.upsert({
      where: { providerId },
      update: {
        qualityScore: ranking.qualityScore,
        completedJobs: stats.completedJobs,
        repeatRate: stats.repeatRate,
        cancellationRate: stats.cancellationRate,
        responseRate: stats.responseRate,
        onTimeRate: stats.onTimeRate,
        computedAt: new Date(),
      },
      create: {
        providerId,
        qualityScore: ranking.qualityScore,
        completedJobs: stats.completedJobs,
        repeatRate: stats.repeatRate,
        cancellationRate: stats.cancellationRate,
        responseRate: stats.responseRate,
        onTimeRate: stats.onTimeRate,
      },
    });

    return ranking;
  }

  async getDashboard(providerId: string): Promise<ProviderDashboard> {
    const ranking = await this.calculate(providerId);
    const signals = ranking.signals;

    const trust: TrustSignals = {
      rating: signals.overallRating,
      customersServed: signals.totalCustomers,
      completionRate: 1 - signals.cancellationRate,
      responseRate: signals.responseRate,
      verified: signals.verificationLevel !== null && signals.verificationScore >= 60,
    };

    const insights = this.generateInsights(ranking);

    return {
      ranking,
      signals,
      trustSignals: trust,
      insights,
    };
  }

  async getRanking(providerId: string): Promise<ProviderRanking> {
    return this.calculate(providerId);
  }

  async computeAllSnapshots(): Promise<number> {
    const providers = await this.prisma.providerProfile.findMany({
      where: { status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] } },
      select: { id: true, userId: true },
    });

    for (const p of providers) {
      try {
        await this.calculate(p.userId);
      } catch (err) {
        this.logger.warn(`Failed to compute ranking for provider ${p.userId}: ${(err as Error).message}`);
      }
    }

    return providers.length;
  }

  private async computeStats(providerId: string): Promise<ProviderSignals> {
    const reviews = await this.prisma.review.findMany({
      where: { providerId, status: 'APPROVED' },
      include: { dimensions: true },
    });

    const overallAvg = reviews.length
      ? reviews.reduce((s, r) => s + r.overall, 0) / reviews.length
      : 0;

    const bookings = await this.prisma.booking.findMany({
      where: { providerId },
      orderBy: { createdAt: 'asc' },
    });

    const completedBookings = bookings.filter((b) => b.status === 'COMPLETED');
    const cancelledBookings = bookings.filter((b) => b.status === 'CANCELLED');
    const totalBookings = bookings.length;

    const customerIds = new Set(
      completedBookings.map((b) => b.customerId).filter(Boolean),
    );
    const repeatCustomerIds = new Set<string>();
    const customerCounts = new Map<string, number>();
    for (const b of completedBookings) {
      if (!b.customerId) continue;
      const count = (customerCounts.get(b.customerId) || 0) + 1;
      customerCounts.set(b.customerId, count);
      if (count >= 2) repeatCustomerIds.add(b.customerId);
    }

    const repeatRate = customerIds.size > 0 ? repeatCustomerIds.size / customerIds.size : 0;
    const cancellationRate = totalBookings > 0 ? cancelledBookings.length / totalBookings : 0;

    const respondedCount = reviews.filter((r) => r.response !== null || r.responseId).length;
    const responseRate = reviews.length > 0 ? respondedCount / reviews.length : 0;

    let onTimeCount = 0;
    for (const b of completedBookings) {
      const actualEnd = b.updatedAt ?? b.startsAt;
      if (actualEnd <= b.endsAt) onTimeCount++;
    }
    const onTimeRate = completedBookings.length > 0 ? onTimeCount / completedBookings.length : 0;

    const verification = await this.prisma.providerVerification.findUnique({
      where: { providerId },
      select: { level: true, status: true },
    });
    const verificationLevel = verification?.level ?? null;
    const verificationScore = this.verificationLevelToScore(verificationLevel);

    const profileCompleteness = await this.computeProfileCompleteness(providerId);

    return {
      overallRating: Math.round(overallAvg * 10) / 10,
      totalReviews: reviews.length,
      completedJobs: completedBookings.length,
      repeatRate: Math.round(repeatRate * 100) / 100,
      cancellationRate: Math.round(cancellationRate * 100) / 100,
      responseRate: Math.round(responseRate * 100) / 100,
      onTimeRate: Math.round(onTimeRate * 100) / 100,
      verificationLevel,
      verificationScore,
      profileCompleteness,
      totalCustomers: customerIds.size,
      totalBookings,
    };
  }

  private async computeComponents(
    providerId: string,
    stats: ProviderSignals,
    weights: RankingWeights,
  ): Promise<RankingComponent[]> {
    const bayesianCustomerRating = this.bayesianAverage(
      stats.overallRating,
      stats.totalReviews,
      BAYESIAN_GLOBAL_MEAN,
      BAYESIAN_CONFIDENCE,
    );

    const customerRatingComponent: RankingComponent = {
      name: 'Customer Rating',
      rawValue: stats.overallRating,
      normalizedScore: (bayesianCustomerRating / 5) * 100,
      weight: weights.customerRating,
      weightedScore: 0,
      confidence: this.confidence(stats.totalReviews),
    };

    const completedJobsComponent: RankingComponent = {
      name: 'Completed Jobs',
      rawValue: stats.completedJobs,
      normalizedScore: this.logNormalize(stats.completedJobs, 100),
      weight: weights.completedJobs,
      weightedScore: 0,
      confidence: this.confidence(Math.min(stats.completedJobs, 20)),
    };

    const repeatRateComponent: RankingComponent = {
      name: 'Repeat Customer Rate',
      rawValue: stats.repeatRate,
      normalizedScore: stats.repeatRate * 100,
      weight: weights.repeatRate,
      weightedScore: 0,
      confidence: this.confidence(stats.totalReviews),
    };

    const cancellationComponent: RankingComponent = {
      name: 'Cancellation Rate',
      rawValue: stats.cancellationRate,
      normalizedScore: (1 - stats.cancellationRate) * 100,
      weight: weights.cancellationRate,
      weightedScore: 0,
      confidence: this.confidence(stats.totalBookings ?? Math.max(stats.completedJobs, 1)),
    };

    const responseComponent: RankingComponent = {
      name: 'Response Rate',
      rawValue: stats.responseRate,
      normalizedScore: stats.responseRate * 100,
      weight: weights.responseRate,
      weightedScore: 0,
      confidence: this.confidence(stats.totalReviews),
    };

    const onTimeComponent: RankingComponent = {
      name: 'On-time Completion',
      rawValue: stats.onTimeRate,
      normalizedScore: stats.onTimeRate * 100,
      weight: weights.onTimeRate,
      weightedScore: 0,
      confidence: this.confidence(stats.completedJobs),
    };

    const verificationComponent: RankingComponent = {
      name: 'Verification / Profile',
      rawValue: (stats.verificationScore + stats.profileCompleteness) / 2,
      normalizedScore: (stats.verificationScore + stats.profileCompleteness) / 2,
      weight: weights.verificationProfile,
      weightedScore: 0,
      confidence: stats.verificationLevel !== null ? 1 : 0,
    };

    const components = [
      customerRatingComponent,
      completedJobsComponent,
      repeatRateComponent,
      cancellationComponent,
      responseComponent,
      onTimeComponent,
      verificationComponent,
    ];

    for (const c of components) {
      c.weightedScore = Math.round(c.normalizedScore * c.weight * 100) / 100;
    }

    return components;
  }

  private bayesianAverage(
    rating: number,
    count: number,
    globalMean: number,
    confidence: number,
  ): number {
    if (count === 0) return globalMean;
    return ((confidence * globalMean + count * rating) / (confidence + count));
  }

  private logNormalize(value: number, max: number): number {
    if (value === 0) return 0;
    return (Math.log(1 + value) / Math.log(1 + max)) * 100;
  }

  private confidence(sampleSize: number): number {
    return Math.min(1, sampleSize / BAYESIAN_SAMPLE_THRESHOLD);
  }

  private verificationLevelToScore(level: string | null | undefined): number {
    const scores: Record<string, number> = {
      BASIC: 20,
      PHONE_VERIFIED: 40,
      IDENTITY_VERIFIED: 60,
      PROFESSIONAL_VERIFIED: 75,
      BUSINESS_VERIFIED: 85,
      TRUSTED_PROVIDER: 100,
    };
    if (!level) return 0;
    return scores[level] ?? 0;
  }

  private async computeProfileCompleteness(providerId: string): Promise<number> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: providerId },
    });
    if (!profile) return 0;

    const fields = [
      profile.businessName,
      profile.slug,
      profile.bio,
      profile.city,
      profile.country,
      profile.tagline,
      profile.websiteUrl,
      profile.businessPhone,
      profile.yearsExperience,
      profile.lat,
      profile.lng,
      profile.serviceRadiusKm,
    ];

    const filled = fields.filter((f) => f !== null && f !== undefined && f !== '').length;
    return Math.round((filled / fields.length) * 100);
  }

  private generateInsights(ranking: ProviderRanking): PerformanceInsights {
    const strengths: string[] = [];
    const improvements: string[] = [];

    for (const comp of ranking.components) {
      if (comp.normalizedScore >= 80) {
        strengths.push(comp.name);
      } else if (comp.normalizedScore < 50) {
        improvements.push(comp.name);
      }
    }

    return {
      strengths,
      improvements,
      dimensionAverages: {},
    };
  }
}
