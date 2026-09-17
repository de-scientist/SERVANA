import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppLoggerService } from '../../common/logging/logger.service';
import {
  CreateReviewInput,
  RespondReviewInput,
  ModerateReviewInput,
  ListReviewsInput,
} from './dtos/review.schema';

export interface ReviewActor {
  sub: string;
  role: string;
}

interface DimensionInput {
  name: string;
  score: number;
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly logger: AppLoggerService,
  ) {}

  async create(actor: ReviewActor, input: CreateReviewInput) {
    const customerId = actor.sub;

    const booking = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { payment: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.customerId !== customerId) throw new ForbiddenException('Not your booking');
    if (booking.status !== 'COMPLETED') throw new BadRequestException('Booking must be completed');
    if (booking.payment?.status !== 'SUCCESSFUL') {
      throw new BadRequestException('Booking payment must be successful');
    }

    const existing = await this.prisma.review.findUnique({ where: { bookingId: input.bookingId } });
    if (existing) throw new ConflictException('Review already exists for this booking');

    const dimensionScores: DimensionInput[] = input.dimensions;

    const created = await this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          bookingId: input.bookingId,
          customerId,
          providerId: booking.providerId,
          overall: input.overall,
          status: 'APPROVED',
          title: input.title ?? null,
          body: input.body ?? null,
        },
      });

      await tx.reviewDimension.createMany({
        data: dimensionScores.map((d) => ({
          reviewId: review.id,
          name: d.name,
          score: d.score,
        })),
      });

      await this.audit.record({
        actorId: customerId,
        action: 'review.created',
        entity: 'review',
        entityId: review.id,
        after: { overall: input.overall, providerId: booking.providerId },
      });

      return review;
    });

    this.logger.log(`Review created for booking ${input.bookingId}`);
    return created;
  }

  async respond(actor: ReviewActor, reviewId: string, input: RespondReviewInput) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) throw new NotFoundException('Review not found');
    if (actor.role !== 'PROVIDER') throw new ForbiddenException('Only providers can respond');
    if (review.providerId !== actor.sub) throw new ForbiddenException('Not your provider');

    await this.prisma.reviewResponse.upsert({
      where: { reviewId },
      update: { body: input.body, updatedAt: new Date() },
      create: { reviewId, body: input.body },
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'review.respond',
      entity: 'reviewResponse',
      entityId: reviewId,
      after: { reviewId, body: input.body },
    });

    return { reviewId, body: input.body };
  }

  async moderate(actor: ReviewActor, reviewId: string, input: ModerateReviewInput) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can moderate');
    }

    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    let status: string;
    switch (input.action) {
      case 'APPROVE':
        status = 'APPROVED';
        break;
      case 'REJECT':
        status = 'REJECTED';
        break;
      case 'REMOVE':
        status = 'REMOVED';
        break;
      default:
        throw new BadRequestException('Invalid action');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { status },
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'review.moderated',
      entity: 'review',
      entityId: reviewId,
      before: { status: review.status },
      after: { status, notes: input.notes ?? null },
    });

    return updated;
  }

  async getById(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        dimensions: { orderBy: { createdAt: 'asc' } },
        response: true,
        booking: { select: { reference: true, startsAt: true } },
      },
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  async getForProvider(providerId: string, input: ListReviewsInput) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));

    const where: Prisma.ReviewWhereInput = { providerId };
    if (input.status) where.status = input.status as any;

    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          dimensions: { orderBy: { createdAt: 'asc' } },
          response: true,
          booking: { select: { reference: true, startsAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.mapReview(r)),
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 },
    };
  }

  async getStats(providerId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { providerId, status: 'APPROVED' as any },
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

    const respondedCount = reviews.filter((r) => r.response !== null).length;
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
    const verificationScore = verificationLevel
      ? ({ BASIC: 20, PHONE_VERIFIED: 40, IDENTITY_VERIFIED: 60, PROFESSIONAL_VERIFIED: 75, BUSINESS_VERIFIED: 85, TRUSTED_PROVIDER: 100 } as Record<string, number>)[verificationLevel] ?? 0
      : 0;

    const profile = await this.prisma.providerProfile.findUnique({ where: { userId: providerId } });
    let profileCompleteness = 0;
    if (profile) {
      const fields = [
        profile.businessName, profile.slug, profile.bio, profile.city, profile.country,
        profile.tagline, profile.websiteUrl, profile.businessPhone, profile.yearsExperience,
        profile.lat, profile.lng, profile.serviceRadiusKm,
      ];
      const filled = fields.filter((f) => f !== null && f !== undefined && f !== '').length;
      profileCompleteness = Math.round((filled / fields.length) * 100);
    }

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

  private mapReview(r: any) {
    return {
      id: r.id,
      bookingId: r.bookingId,
      customerId: r.customerId,
      providerId: r.providerId,
      overall: r.overall,
      title: r.title,
      body: r.body,
      status: r.status,
      dimensions: (r.dimensions ?? []).map((d: any) => ({
        id: d.id,
        name: d.name,
        score: d.score,
      })),
      response: r.response ? { id: r.response.id, body: r.response.body, createdAt: r.response.createdAt, updatedAt: r.response.updatedAt } : null,
      booking: r.booking ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
