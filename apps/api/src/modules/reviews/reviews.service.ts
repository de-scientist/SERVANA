import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
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
  role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SUPPORT' | 'SUPER_ADMIN';
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
    const avg = dimensionScores.reduce((s, d) => s + d.score, 0) / dimensionScores.length;

    const created = await this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          bookingId: input.bookingId,
          customerId,
          providerId: booking.providerId,
          overall: input.overall,
          title: input.title ?? null,
          body: input.body ?? null,
          status: 'APPROVED',
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
      include: { provider: true },
    });

    if (!review) throw new NotFoundException('Review not found');
    if (actor.role !== 'PROVIDER') throw new ForbiddenException('Only providers can respond');
    if (review.providerId !== actor.sub) throw new ForbiddenException('Not your provider');

    const existing = await this.prisma.reviewResponse.findUnique({ where: { reviewId } });

    const response = await this.prisma.reviewResponse.upsert({
      where: { reviewId },
      update: { body: input.body, updatedAt: new Date() },
      create: { reviewId, body: input.body },
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'review.respond',
      entity: 'reviewResponse',
      entityId: response.id,
      after: { reviewId, body: input.body },
    });

    return response;
  }

  async moderate(actor: ReviewActor, reviewId: string, input: ModerateReviewInput) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can moderate');
    }

    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    let status: ReviewStatus;
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
    if (input.status) where.status = input.status;

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
    const [reviews, totalCustomers, completedBookings] = await Promise.all([
      this.prisma.review.findMany({
        where: { providerId, status: 'APPROVED' },
        include: { dimensions: true },
      }),
      this.prisma.booking.count({
        where: { providerId, status: 'COMPLETED', customerId: { not: null } },
      }),
      this.prisma.booking.count({
        where: { providerId, status: 'COMPLETED' },
      }),
    ]);

    const approved = reviews.filter((r) => r.status === 'APPROVED');
    const overallAvg = approved.length
      ? approved.reduce((s, r) => s + r.overall, 0) / approved.length
      : 0;

    const dimAvgs: Record<string, number> = {};
    for (const dim of ['Quality', 'Professionalism', 'Communication', 'Punctuality', 'Value']) {
      const scores = approved.flatMap((r) => r.dimensions.filter((d) => d.name === dim).map((d) => d.score));
      dimAvgs[dim] = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    }

    const customerIds = await this.prisma.booking.findMany({
      where: { providerId, status: 'COMPLETED' },
      select: { customerId: true },
    });
    const uniqueCustomers = new Set(customerIds.map((b) => b.customerId));
    const repeatCustomers = await this.prisma.booking.groupBy({
      where: { providerId, status: 'COMPLETED' },
      by: ['customerId'],
      having: { customerId: { _count: { gte: 2 } } },
      _count: { customerId: true },
    });
    const repeatRate = uniqueCustomers.size > 0 ? repeatCustomers.length / uniqueCustomers.size : 0;

    const cancelled = await this.prisma.booking.count({
      where: { providerId, status: 'CANCELLED' },
    });
    const cancellationRate = completedBookings > 0 ? cancelled / (completedBookings + cancelled) : 0;

    const responded = await this.prisma.review.count({
      where: { providerId, status: 'APPROVED', response: { some: {} } },
    });
    const responseRate = approved.length > 0 ? responded / approved.length : 0;

    return {
      overallRating: Math.round(overallAvg * 10) / 10,
      totalReviews: approved.length,
      totalCustomers: uniqueCustomers.size,
      completedJobs: completedBookings,
      repeatRate: Math.round(repeatRate * 100) / 100,
      cancellationRate: Math.round(cancellationRate * 100) / 100,
      responseRate: Math.round(responseRate * 100) / 100,
      dimensionAverages: dimAvgs,
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
      response: r.response ? { id: r.response.id, body: r.response.body, createdAt: r.response.createdAt } : null,
      booking: r.booking ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
