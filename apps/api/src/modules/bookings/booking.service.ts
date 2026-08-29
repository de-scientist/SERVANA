import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, BookingStatus, ServiceDeliveryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertTransition,
  cancelsBooking,
  statusesForView,
  TERMINAL_STATUSES,
} from './booking.state';
import {
  BookingActionInput,
  CancelBookingInput,
  CreateBookingInput,
  ListBookingsInput,
} from './dto/booking.schema';

const MIN_LEAD_MINUTES = 30;

export interface BookingActor {
  sub: string;
  role: 'CUSTOMER' | 'PROVIDER';
}

interface CancellationPolicy {
  freeCancelHours?: number;
  feePercent?: number;
}

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: BookingActor, input: CreateBookingInput) {
    const ps = await this.prisma.providerService.findUnique({
      where: { id: input.providerServiceId },
      include: { provider: { select: { id: true, status: true, cancellationPolicy: true } } },
    });
    if (!ps) throw new NotFoundException('Service not found');
    if (!ps.isActive) throw new BadRequestException('Service is not available');
    if (ps.provider.status !== 'VERIFIED') {
      throw new BadRequestException('Provider is not available for booking');
    }

    const allowed = (ps.deliveryTypes as unknown[]).map(String);
    if (!allowed.includes(input.deliveryType)) {
      throw new BadRequestException('Delivery type not offered for this service');
    }
    if (input.deliveryType === 'AT_CUSTOMER_LOCATION' && !input.address) {
      throw new BadRequestException('Address is required for at-customer bookings');
    }

    const startsAt = new Date(input.startsAt);
    const durationMin = ps.durationMin;
    const bufferMin = ps.bufferMin ?? 0;
    const endsAt = new Date(startsAt.getTime() + (durationMin + bufferMin) * 60000);

    await this.assertSlotAvailable(ps.provider.id, startsAt, endsAt, durationMin, bufferMin, ps.bookingWindowDays ?? null);

    const reference = this.reference();

    try {
      const booking = await this.prisma.$transaction(
        async (tx) => {
          const conflict = await tx.booking.findFirst({
            where: {
              providerId: ps.provider.id,
              status: { notIn: TERMINAL_STATUSES },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
          });
          if (conflict) throw new ConflictException('This time slot is already booked');

          const created = await tx.booking.create({
            data: {
              reference,
              customerId: actor.sub,
              providerId: ps.provider.id,
              serviceId: ps.serviceId,
              providerServiceId: ps.id,
              status: 'PENDING',
              startsAt,
              endsAt,
              deliveryType: input.deliveryType as ServiceDeliveryType,
              address: input.address ?? undefined,
              notes: input.notes,
              priceCents: ps.priceCents,
              currency: ps.currency,
              paymentStatus: 'INITIATED',
            },
          });
          await tx.bookingStatusHistory.create({
            data: {
              bookingId: created.id,
              from: null,
              to: 'PENDING',
              actorId: actor.sub,
              actorRole: actor.role,
              reason: 'Booking created',
            },
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return this.mapBooking(booking.id);
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new ConflictException('This time slot is already booked');
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This time slot is already booked');
      }
      throw err;
    }
  }

  async listForCustomer(actor: BookingActor, query: ListBookingsInput) {
    return this.list('customer', actor.sub, query);
  }

  async listForProvider(actor: BookingActor, query: ListBookingsInput) {
    const profile = await this.providerProfile(actor.sub);
    return this.list('provider', profile.id, query);
  }

  private async list(role: 'customer' | 'provider', ownerId: string, query: ListBookingsInput) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const statuses = statusesForView(query.view, role);
    const where: Prisma.BookingWhereInput = role === 'customer'
      ? { customerId: ownerId }
      : { providerId: ownerId };
    if (statuses.length) where.status = { in: statuses };

    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: this.bookingInclude(),
        orderBy: { startsAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: rows.map((b) => this.mapRow(b)),
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 },
    };
  }

  async getForCustomer(actor: BookingActor, id: string) {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: this.bookingInclude() });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.customerId !== actor.sub) throw new ForbiddenException('Not your booking');
    return this.mapRow(b);
  }

  async getForProvider(actor: BookingActor, id: string) {
    const profile = await this.providerProfile(actor.sub);
    const b = await this.prisma.booking.findUnique({ where: { id }, include: this.bookingInclude() });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.providerId !== profile.id) throw new ForbiddenException('Not your booking');
    return this.mapRow(b);
  }

  // --- provider actions -----------------------------------------------------

  async confirm(actor: BookingActor, id: string, input?: BookingActionInput) {
    return this.providerTransition(actor, id, 'CONFIRMED', input?.reason);
  }

  async decline(actor: BookingActor, id: string, input?: BookingActionInput) {
    return this.providerTransition(actor, id, 'PROVIDER_REJECTED', input?.reason);
  }

  async start(actor: BookingActor, id: string) {
    return this.providerTransition(actor, id, 'IN_PROGRESS');
  }

  async complete(actor: BookingActor, id: string) {
    return this.providerTransition(actor, id, 'COMPLETED');
  }

  private async providerTransition(actor: BookingActor, id: string, to: BookingStatus, reason?: string) {
    const profile = await this.providerProfile(actor.sub);
    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.providerId !== profile.id) throw new ForbiddenException('Not your booking');
    assertTransition(b.status, to);

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: to },
    });
    await this.prisma.bookingStatusHistory.create({
      data: { bookingId: id, from: b.status, to, actorId: actor.sub, actorRole: 'PROVIDER', reason },
    });
    return this.mapBooking(id);
  }

  // --- cancellation ----------------------------------------------------------

  async cancelAsCustomer(actor: BookingActor, id: string, input: CancelBookingInput) {
    return this.cancel(actor, id, 'CUSTOMER', input.reason);
  }

  async cancelAsProvider(actor: BookingActor, id: string, input: CancelBookingInput) {
    return this.cancel(actor, id, 'PROVIDER', input.reason);
  }

  private async cancel(actor: BookingActor, id: string, by: 'CUSTOMER' | 'PROVIDER', reason?: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id },
      include: { provider: { select: { cancellationPolicy: true } } },
    });
    if (!b) throw new NotFoundException('Booking not found');

    if (by === 'CUSTOMER' && b.customerId !== actor.sub) throw new ForbiddenException('Not your booking');
    if (by === 'PROVIDER') {
      const profile = await this.providerProfile(actor.sub);
      if (b.providerId !== profile.id) throw new ForbiddenException('Not your booking');
    }

    if (!cancelsBooking(b.status)) {
      throw new BadRequestException(`Cannot cancel a booking in status ${b.status}`);
    }

    const policy: CancellationPolicy = (b.provider.cancellationPolicy as CancellationPolicy) ?? {
      freeCancelHours: 24,
      feePercent: 0,
    };
    const hoursUntil = (b.startsAt.getTime() - Date.now()) / 3_600_000;
    const feeCents =
      hoursUntil >= (policy.freeCancelHours ?? 24)
        ? 0
        : Math.round(Number(b.priceCents) * ((policy.feePercent ?? 0) / 100));

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason ?? null,
        cancelledById: actor.sub,
        cancelledByRole: by,
        cancelledAt: new Date(),
        cancelFeeCents: BigInt(feeCents),
      },
    });
    await this.prisma.bookingStatusHistory.create({
      data: {
        bookingId: id,
        from: b.status,
        to: 'CANCELLED',
        actorId: actor.sub,
        actorRole: by,
        reason: reason ?? `Cancelled by ${by}`,
      },
    });
    return this.mapBooking(id);
  }

  // --- helpers ---------------------------------------------------------------

  private async assertSlotAvailable(
    providerId: string,
    startsAt: Date,
    endsAt: Date,
    durationMin: number,
    bufferMin: number,
    bookingWindowDays: number | null,
  ): Promise<void> {
    const now = Date.now();
    if (startsAt.getTime() < now + MIN_LEAD_MINUTES * 60000) {
      throw new BadRequestException('Slot is in the past or too soon');
    }
    if (bookingWindowDays != null && startsAt.getTime() > now + bookingWindowDays * 86_400_000) {
      throw new BadRequestException('Outside the provider booking window');
    }

    const dayStart = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate()));
    const dow = startsAt.getUTCDay();
    const ex = await this.prisma.availabilityException.findFirst({
      where: { providerId, date: dayStart },
    });
    if (ex && (ex.type === 'TIME_OFF' || ex.type === 'HOLIDAY')) {
      throw new BadRequestException('Provider is unavailable on this date');
    }

    const rule = await this.prisma.availabilityRule.findFirst({
      where: { providerId, dayOfWeek: dow },
    });
    if (!rule) throw new BadRequestException('Provider is unavailable on this date');

    const startMin = startsAt.getUTCHours() * 60 + startsAt.getUTCMinutes();
    const endMin = startMin + durationMin;
    if (endMin > rule.endMin) {
      throw new BadRequestException('Service extends past provider closing time');
    }
    if (startMin + durationMin + bufferMin > rule.endMin) {
      throw new BadRequestException('Service + buffer extends past provider closing time');
    }
    if (rule.breakStart != null && rule.breakEnd != null) {
      const overlapsBreak = startMin < rule.breakEnd && endMin > rule.breakStart;
      if (overlapsBreak) throw new BadRequestException('Slot overlaps a provider break');
    }

    const conflict = await this.prisma.booking.findFirst({
      where: {
        providerId,
        status: { notIn: TERMINAL_STATUSES },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (conflict) throw new ConflictException('This time slot is already booked');
  }

  private async providerProfile(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Provider profile not found');
    return profile;
  }

  private reference(): string {
    return `SVN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }

  private bookingInclude() {
    return {
      providerService: {
        include: { provider: { select: { id: true, businessName: true, slug: true } } },
      },
      history: { orderBy: { createdAt: 'asc' } },
    };
  }

  private async mapBooking(id: string) {
    const b = await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: this.bookingInclude() });
    return this.mapRow(b);
  }

  private mapRow(b: any) {
    return {
      id: b.id,
      reference: b.reference,
      status: b.status,
      paymentStatus: b.paymentStatus,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      deliveryType: b.deliveryType,
      address: b.address,
      notes: b.notes,
      priceCents: b.priceCents.toString(),
      currency: b.currency,
      cancellationReason: b.cancellationReason,
      cancelledById: b.cancelledById,
      cancelledByRole: b.cancelledByRole,
      cancelledAt: b.cancelledAt,
      cancelFeeCents: b.cancelFeeCents != null ? b.cancelFeeCents.toString() : null,
      service: { id: b.providerServiceId, name: b.providerService?.name ?? null },
      provider: b.providerService?.provider ?? null,
      history: (b.history ?? []).map((h: any) => ({
        from: h.from,
        to: h.to,
        actorId: h.actorId,
        actorRole: h.actorRole,
        reason: h.reason,
        createdAt: h.createdAt,
      })),
    };
  }
}
