import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentGateway } from './payment.gateway';
import { CommissionService } from './commission.service';
import { PaymentMethod, PaymentWebhookEvent } from '../../common/adapters/payment/payment.provider';
import { BookingStatus } from '@prisma/client';

export interface PaymentActor {
  sub: string;
  role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SUPPORT';
}

export interface InitiatePaymentInput {
  bookingId: string;
  method?: PaymentMethod;
}

const PAYABLE_STATUSES: BookingStatus[] = [
  'PENDING',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'PROVIDER_ACCEPTED',
  'IN_PROGRESS',
  'PAID',
];

const LOYALTY_TIER_ID = 'default';
const PAYOUT_EXPIRY_MINUTES = Number(process.env.PAYMENT_EXPIRY_MINUTES ?? 30);

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
    private readonly commission: CommissionService,
  ) {}

  // --- initiate -------------------------------------------------------------

  async initiate(actor: PaymentActor, input: InitiatePaymentInput) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: {
        providerService: { include: { provider: { select: { id: true, status: true } } } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.customerId !== actor.sub) throw new ForbiddenException('Not your booking');
    if (!PAYABLE_STATUSES.includes(booking.status)) {
      throw new BadRequestException(`Booking in status ${booking.status} cannot be paid`);
    }

    const method: PaymentMethod = input.method ?? 'OTHER';

    // Idempotent initiation: reuse the existing pending payment for this booking.
    const existing = await this.prisma.payment.findUnique({ where: { bookingId: booking.id } });
    if (existing) {
      if (existing.status === 'SUCCESSFUL' || existing.status === 'REFUNDED') {
        throw new BadRequestException('Booking already paid');
      }
      return this.mapPayment(existing.id);
    }

    const provider = this.gateway.get(method);
    const idempotencyKey = `pay_${booking.id}`;
    const init = await provider.initiate({
      idempotencyKey,
      amountCents: booking.priceCents,
      currency: booking.currency,
      reference: booking.reference,
      method,
    });

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        providerId: booking.providerId,
        amountCents: booking.priceCents,
        currency: booking.currency,
        status: 'PENDING',
        provider: provider.id,
        method,
        providerRef: init.providerRef,
        idempotencyKey,
        grossCents: booking.priceCents,
        commissionCents: 0n,
        netCents: booking.priceCents,
        expiresAt: new Date(Date.now() + PAYOUT_EXPIRY_MINUTES * 60_000),
      },
    });

    await this.setBookingStatus(booking.id, 'AWAITING_PAYMENT', actor.sub, 'CUSTOMER', 'Awaiting payment');
    await this.prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'PENDING' } });

    return this.mapPayment(payment.id);
  }

  // --- provider webhook / callback ------------------------------------------

  async handleProviderEvent(providerId: string, event: PaymentWebhookEvent) {
    const provider = this.gateway.getById(providerId);
    if (!provider) return { ok: false, error: 'unknown provider' };

    return this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findFirst({ where: { providerRef: event.providerRef } });
        if (!payment) return { ok: true, ignored: true };

        // Idempotency: a payment already captured must not be processed again.
        if (payment.status === 'SUCCESSFUL') return { ok: true, duplicate: true };

        if (event.status === 'PENDING') {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'PENDING', webhookRaw: event as any } });
          return { ok: true };
        }

        if (event.status === 'FAILED') {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', webhookRaw: event as any } });
          await tx.booking.update({ where: { id: payment.bookingId! }, data: { paymentStatus: 'FAILED' } });
          await this.setBookingStatus(payment.bookingId!, 'PENDING', null, 'SYSTEM', 'Payment failed');
          return { ok: true, failed: true };
        }

        // SUCCESSFUL
        if (payment.expiresAt && new Date() > payment.expiresAt) {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED', webhookRaw: event as any } });
          await this.setBookingStatus(payment.bookingId!, 'EXPIRED', null, 'SYSTEM', 'Payment expired');
          return { ok: true, expired: true };
        }

        // Never trust the provider amount — compare to our server-side gross.
        if (event.amount !== Number(payment.grossCents) || event.currency !== payment.currency) {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', webhookRaw: event as any } });
          await tx.booking.update({ where: { id: payment.bookingId! }, data: { paymentStatus: 'FAILED' } });
          await this.setBookingStatus(payment.bookingId!, 'PENDING', null, 'SYSTEM', 'Payment amount mismatch');
          return { ok: true, amountMismatch: true };
        }

        const booking = await tx.booking.findUnique({
          where: { id: payment.bookingId! },
          include: { providerService: { select: { categoryId: true } } },
        });
        if (!booking) return { ok: true, ignored: true };

        const calc = await this.commission.compute(payment.grossCents, {
          providerId: booking.providerId,
          categoryId: booking.providerService?.categoryId ?? null,
        });
        const netCents = payment.grossCents - calc.commissionCents;

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCESSFUL',
            commissionCents: calc.commissionCents,
            netCents,
            webhookRaw: event as any,
          },
        });

        // Immutable ledger entries.
        await tx.paymentTransaction.create({
          data: { paymentId: payment.id, type: 'CAPTURE', amountCents: payment.grossCents, currency: payment.currency },
        });

        // Persisted commission calculation (auditable).
        await tx.commission.upsert({
          where: { paymentId: payment.id },
          create: {
            paymentId: payment.id,
            ruleSnapshot: calc.ruleSnapshot as any,
            baseCents: payment.grossCents,
            rateBasisPoints: calc.rateBasisPoints,
            commissionCents: calc.commissionCents,
          },
          update: {
            ruleSnapshot: calc.ruleSnapshot as any,
            rateBasisPoints: calc.rateBasisPoints,
            commissionCents: calc.commissionCents,
          },
        });

        // Provider earning (idempotent via unique bookingId).
        await tx.providerEarning.upsert({
          where: { bookingId: booking.id },
          create: {
            providerId: booking.providerId,
            bookingId: booking.id,
            grossCents: payment.grossCents,
            commissionCents: calc.commissionCents,
            feeCents: 0n,
            netCents,
            status: 'AVAILABLE',
          },
          update: {
            grossCents: payment.grossCents,
            commissionCents: calc.commissionCents,
            netCents,
            status: 'AVAILABLE',
          },
        });

        // Payout to provider (idempotent via unique reference).
        const payoutMethod = await this.ensurePayoutMethod(tx, booking.providerId);
        await tx.payout.upsert({
          where: { reference: `PO_${payment.id}` },
          create: {
            providerId: booking.providerId,
            methodId: payoutMethod.id,
            status: 'PENDING',
            totalCents: netCents,
            currency: payment.currency,
            reference: `PO_${payment.id}`,
          },
          update: {},
        });

        // Loyalty (idempotent via refType/refId guard).
        await this.awardLoyalty(tx, booking.customerId, payment.id, payment.grossCents);

        // Confirm the booking financially.
        if (booking.status === 'PENDING' || booking.status === 'AWAITING_PAYMENT') {
          await this.setBookingStatus(booking.id, 'PAID', null, 'SYSTEM', 'Payment captured');
        }
        await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'SUCCESSFUL' } });

        return { ok: true, captured: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // --- refund ---------------------------------------------------------------

  async refund(actor: PaymentActor, paymentId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (actor.role === 'CUSTOMER' && payment.customerId !== actor.sub) {
      throw new ForbiddenException('Not your payment');
    }
    if (payment.status !== 'SUCCESSFUL') {
      throw new BadRequestException('Only a successful payment can be refunded');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const p = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!p || p.status !== 'SUCCESSFUL') throw new BadRequestException('Payment not refundable');

        await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' } });
        await tx.refund.create({
          data: { paymentId, amountCents: p.grossCents, reason: reason ?? 'Refund requested' },
        });
        await tx.paymentTransaction.create({
          data: { paymentId, type: 'REFUND', amountCents: p.grossCents, currency: p.currency },
        });
        await tx.providerEarning.updateMany({
          where: { bookingId: p.bookingId! },
          data: { status: 'REVERSED', refundCents: p.grossCents },
        });

        // Reverse loyalty, idempotently.
        const earned = await tx.loyaltyTransaction.findFirst({ where: { refType: 'PAYMENT', refId: paymentId } });
        if (earned) {
          const account = await tx.loyaltyAccount.findFirst({ where: { id: earned.accountId } });
          if (account) {
            await tx.loyaltyAccount.update({
              where: { id: account.id },
              data: { balanceCents: { decrement: earned.deltaCents } },
            });
          }
          await tx.loyaltyTransaction.create({
            data: {
              accountId: earned.accountId,
              type: 'REDEEM',
              deltaCents: -earned.deltaCents,
              reason: 'Refund reversal',
              refType: 'REFUND',
              refId: paymentId,
            },
          });
        }

        if (p.bookingId) {
          const b = await tx.booking.findUnique({ where: { id: p.bookingId } });
          if (b) {
            await tx.booking.update({ where: { id: p.bookingId }, data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' } });
            await tx.bookingStatusHistory.create({
              data: {
                bookingId: p.bookingId,
                from: b.status,
                to: 'REFUNDED',
                actorId: actor.sub,
                actorRole: actor.role,
                reason: reason ?? 'Refunded',
              },
            });
          }
        }

        // Notify the provider (no real money moves in dev/stub).
        const provider = this.gateway.getById(p.provider) ?? this.gateway.get((p.method as PaymentMethod) ?? 'OTHER');
        await provider.refund({ providerRef: p.providerRef ?? '', amountCents: p.grossCents, reason });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.mapPayment(paymentId);
  }

  // --- read -----------------------------------------------------------------

  async getForCustomer(actor: PaymentActor, id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id }, include: this.paymentDetailInclude() });
    if (!p) throw new NotFoundException('Payment not found');
    if (p.customerId !== actor.sub && actor.role !== 'ADMIN' && actor.role !== 'SUPPORT') {
      throw new ForbiddenException('Not your payment');
    }
    return this.mapPaymentDetail(p);
  }

  // --- helpers --------------------------------------------------------------

  private async setBookingStatus(
    bookingId: string,
    to: BookingStatus,
    actorId: string | null,
    actorRole: string,
    reason?: string,
  ) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.status === to) return;
    await this.prisma.booking.update({ where: { id: bookingId }, data: { status: to } });
    await this.prisma.bookingStatusHistory.create({
      data: { bookingId, from: b.status, to, actorId, actorRole, reason },
    });
  }

  private async ensurePayoutMethod(tx: Prisma.TransactionClient, providerId: string) {
    const existing = await tx.payoutMethod.findFirst({ where: { providerId, isDefault: true } });
    if (existing) return existing;
    return tx.payoutMethod.create({
      data: { providerId, type: 'MPESA', detailsRef: `default_${providerId}`, isDefault: true },
    });
  }

  private async awardLoyalty(
    tx: Prisma.TransactionClient,
    customerId: string,
    paymentId: string,
    grossCents: bigint,
  ) {
    const existing = await tx.loyaltyTransaction.findFirst({ where: { refType: 'PAYMENT', refId: paymentId } });
    if (existing) return; // idempotent

    await tx.loyaltyTier.upsert({
      where: { id: LOYALTY_TIER_ID },
      update: {},
      create: { id: LOYALTY_TIER_ID, name: 'Standard', thresholdCents: 0n },
    });

    const account = await tx.loyaltyAccount.upsert({
      where: { customerId },
      update: {},
      create: { customerId, tierId: LOYALTY_TIER_ID, balanceCents: 0n },
    });

    await tx.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type: 'EARN_BOOKING',
        deltaCents: grossCents,
        reason: 'Booking payment',
        refType: 'PAYMENT',
        refId: paymentId,
      },
    });
    await tx.loyaltyAccount.update({ where: { id: account.id }, data: { balanceCents: { increment: grossCents } } });
  }

  private paymentDetailInclude(): Prisma.PaymentInclude {
    return {
      transactions: { orderBy: { createdAt: 'asc' } },
      commission: true,
      refunds: true,
    };
  }

  private async mapPayment(id: string) {
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
    return this.mapPaymentRow(p);
  }

  private mapPaymentRow(p: any) {
    return {
      id: p.id,
      bookingId: p.bookingId,
      status: p.status,
      method: p.method,
      provider: p.provider,
      providerRef: p.providerRef,
      grossCents: p.grossCents.toString(),
      commissionCents: p.commissionCents.toString(),
      netCents: p.netCents.toString(),
      currency: p.currency,
      expiresAt: p.expiresAt,
      createdAt: p.createdAt,
    };
  }

  private mapPaymentDetail(p: any) {
    return {
      ...this.mapPaymentRow(p),
      transactions: (p.transactions ?? []).map((t: any) => ({
        type: t.type,
        amountCents: t.amountCents.toString(),
        currency: t.currency,
        createdAt: t.createdAt,
      })),
      commission: p.commission
        ? {
            rateBasisPoints: p.commission.rateBasisPoints,
            baseCents: p.commission.baseCents.toString(),
            commissionCents: p.commission.commissionCents.toString(),
            ruleSnapshot: p.commission.ruleSnapshot,
          }
        : null,
      refunds: (p.refunds ?? []).map((r: any) => ({
        amountCents: r.amountCents.toString(),
        reason: r.reason,
        createdAt: r.createdAt,
      })),
    };
  }
}
