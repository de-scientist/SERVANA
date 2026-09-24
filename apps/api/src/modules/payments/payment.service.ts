import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentGateway } from './payment.gateway';
import { CommissionService } from './commission.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { NotificationsService } from '../notifications/notifications.service';
import { findInventoryRow } from '../../common/inventory/inventory';
import { formatMoney } from '../../common/money/money';
import { PaymentMethod, PaymentWebhookEvent } from '../../common/adapters/payment/payment.provider';
import { BookingStatus } from '@prisma/client';

export interface PaymentActor {
  sub: string;
  role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SUPPORT' | 'SUPER_ADMIN';
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

const PAYOUT_EXPIRY_MINUTES = Number(process.env.PAYMENT_EXPIRY_MINUTES ?? 30);

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
    private readonly commission: CommissionService,
    private readonly loyalty: LoyaltyService,
    private readonly notifications: NotificationsService,
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

  // --- initiate (orders) ------------------------------------------------------

  async initiateForOrder(
    actor: PaymentActor,
    orderId: string,
    method: PaymentMethod = 'OTHER',
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: { select: { providerId: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== actor.sub && actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'SUPPORT') {
      throw new ForbiddenException('Not your order');
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException(`Order in status ${order.status} cannot be paid`);
    }

    const existing = await this.prisma.payment.findUnique({ where: { orderId: order.id } });
    if (existing) {
      if (existing.status === 'SUCCESSFUL' || existing.status === 'REFUNDED') {
        throw new BadRequestException('Order already paid');
      }
      return this.mapPayment(existing.id);
    }

    const provider = this.gateway.get(method);
    const idempotencyKey = `pay_order_${order.id}`;
    const init = await provider.initiate({
      idempotencyKey,
      amountCents: order.totalCents,
      currency: order.currency,
      reference: `ORD_${order.id.slice(0, 8).toUpperCase()}`,
      method,
    });

    const sellerId = order.items.map((i) => i.product?.providerId).find(Boolean) ?? null;
    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        providerId: sellerId,
        amountCents: order.totalCents,
        currency: order.currency,
        status: 'PENDING',
        provider: provider.id,
        method,
        providerRef: init.providerRef,
        idempotencyKey,
        grossCents: order.totalCents,
        commissionCents: 0n,
        netCents: order.totalCents,
        expiresAt: new Date(Date.now() + PAYOUT_EXPIRY_MINUTES * 60_000),
      },
    });

    return this.mapPayment(payment.id);
  }

  /**
   * Retry a failed/expired order payment with a fresh provider reference.
   * Stock reservations from checkout are untouched — the order is still PENDING.
   */
  async retryOrderPayment(actor: PaymentActor, orderId: string, method?: PaymentMethod) {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) {
      return this.initiateForOrder(actor, orderId, method ?? 'OTHER');
    }
    if (payment.customerId !== actor.sub && actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'SUPPORT') {
      throw new ForbiddenException('Not your order');
    }
    if (payment.status === 'SUCCESSFUL' || payment.status === 'REFUNDED') {
      throw new BadRequestException('Order already paid');
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'PENDING') {
      throw new BadRequestException(`Order in status ${order.status} cannot be paid`);
    }

    const provider = this.gateway.get((method ?? payment.method) as PaymentMethod);
    const init = await provider.initiate({
      idempotencyKey: `pay_order_${order.id}_retry_${Date.now()}`,
      amountCents: order.totalCents,
      currency: order.currency,
      reference: `ORD_${order.id.slice(0, 8).toUpperCase()}`,
      method: (method ?? payment.method) as PaymentMethod,
    });
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PENDING',
        providerRef: init.providerRef,
        expiresAt: new Date(Date.now() + PAYOUT_EXPIRY_MINUTES * 60_000),
      },
    });
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
          if (payment.bookingId) {
            await tx.booking.update({ where: { id: payment.bookingId! }, data: { paymentStatus: 'FAILED' } });
            await this.setBookingStatus(payment.bookingId!, 'PENDING', null, 'SYSTEM', 'Payment failed');
          }
          // Order payments stay PENDING on the order: the customer may retry.
          await this.notifyPaymentEvent(payment, 'PAYMENT_FAILED', { reason: 'declined by provider' });
          return { ok: true, failed: true };
        }

        // SUCCESSFUL
        if (payment.expiresAt && new Date() > payment.expiresAt) {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED', webhookRaw: event as any } });
          if (payment.bookingId) {
            await this.setBookingStatus(payment.bookingId!, 'EXPIRED', null, 'SYSTEM', 'Payment expired');
            return { ok: true, expired: true };
          }
          if (payment.orderId) {
            await this.expireOrderHold(tx, payment.orderId);
            return { ok: true, expired: true };
          }
          return { ok: true, expired: true };
        }

        // Never trust the provider amount — compare to our server-side gross.
        if (event.amount !== payment.grossCents.toString() || event.currency !== payment.currency) {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', webhookRaw: event as any } });
          if (payment.bookingId) {
            await tx.booking.update({ where: { id: payment.bookingId! }, data: { paymentStatus: 'FAILED' } });
            await this.setBookingStatus(payment.bookingId!, 'PENDING', null, 'SYSTEM', 'Payment amount mismatch');
          }
          return { ok: true, amountMismatch: true };
        }

        if (payment.orderId) {
          return this.captureOrderPayment(tx, payment, event);
        }
        if (!payment.bookingId) return { ok: true, ignored: true };

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
        const earning = await tx.providerEarning.upsert({
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
        // The payout MUST link to its earning(s) via PayoutItem — otherwise
        // money would disappear between the earning and payout stages and
        // reconciliation could never prove ledger integrity.
        const payoutMethod = await this.ensurePayoutMethod(tx, booking.providerId);
        const payout = await tx.payout.upsert({
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
        await tx.payoutItem.upsert({
          where: { payoutId_earningId: { payoutId: payout.id, earningId: earning.id } },
          create: {
            payoutId: payout.id,
            earningId: earning.id,
            amountCents: netCents,
          },
          update: {},
        });

        // Loyalty (idempotent via refType/refId guard).
        await this.awardLoyalty(tx, booking.customerId, payment.id, 'BOOKING');

        // Confirm the booking financially.
        if (booking.status === 'PENDING' || booking.status === 'AWAITING_PAYMENT') {
          await this.setBookingStatus(booking.id, 'PAID', null, 'SYSTEM', 'Payment captured');
        }
        await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'SUCCESSFUL' } });
        await this.notifyPaymentEvent(payment, 'PAYMENT_SUCCESSFUL');

        return { ok: true, captured: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // --- order capture (webhook SUCCESS for order payments) -----------------------
  // Finalizes reserved stock, books commission + seller earning, queues the
  // seller payout and confirms the order — all atomically. Platform-owned
  // orders (no seller) keep the full margin as commission so the ledger
  // invariant (payments == commissions + fees + earnings) always holds.

  private async captureOrderPayment(tx: Prisma.TransactionClient, payment: any, event: PaymentWebhookEvent) {
    const order = await tx.order.findUnique({
      where: { id: payment.orderId },
      include: { items: { include: { product: { select: { providerId: true } } } } },
    });
    if (!order) return { ok: true, ignored: true };

    const sellerId: string | null =
      order.items.map((i: any) => i.product?.providerId).find(Boolean) ?? null;
    const calc = await this.commission.compute(payment.grossCents, {
      providerId: sellerId,
      categoryId: null,
    });
    const platformOrder = !sellerId;
    const commissionCents = platformOrder ? payment.grossCents : calc.commissionCents;
    const netCents = payment.grossCents - commissionCents;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESSFUL',
        commissionCents,
        netCents,
        webhookRaw: event as any,
      },
    });

    await tx.paymentTransaction.create({
      data: { paymentId: payment.id, type: 'CAPTURE', amountCents: payment.grossCents, currency: payment.currency },
    });

    await tx.commission.upsert({
      where: { paymentId: payment.id },
      create: {
        paymentId: payment.id,
        ruleSnapshot: (platformOrder
          ? [{ id: 'platform', scope: 'platform', type: 'PERCENTAGE', value: 10000, priority: 0 }]
          : calc.ruleSnapshot) as any,
        baseCents: payment.grossCents,
        rateBasisPoints: platformOrder ? 10000 : calc.rateBasisPoints,
        commissionCents,
      },
      update: {
        ruleSnapshot: (platformOrder
          ? [{ id: 'platform', scope: 'platform', type: 'PERCENTAGE', value: 10000, priority: 0 }]
          : calc.ruleSnapshot) as any,
        rateBasisPoints: platformOrder ? 10000 : calc.rateBasisPoints,
        commissionCents,
      },
    });

    if (!platformOrder) {
      const earning = await tx.providerEarning.upsert({
        where: { orderId: order.id },
        create: {
          providerId: sellerId!,
          orderId: order.id,
          grossCents: payment.grossCents,
          commissionCents,
          feeCents: 0n,
          netCents,
          status: 'AVAILABLE',
        },
        update: {
          grossCents: payment.grossCents,
          commissionCents,
          netCents,
          status: 'AVAILABLE',
        },
      });

      const payoutMethod = await this.ensurePayoutMethod(tx, sellerId!);
      const payout = await tx.payout.upsert({
        where: { reference: `PO_${payment.id}` },
        create: {
          providerId: sellerId!,
          methodId: payoutMethod.id,
          status: 'PENDING',
          totalCents: netCents,
          currency: payment.currency,
          reference: `PO_${payment.id}`,
        },
        update: {},
      });
      await tx.payoutItem.upsert({
        where: { payoutId_earningId: { payoutId: payout.id, earningId: earning.id } },
        create: { payoutId: payout.id, earningId: earning.id, amountCents: netCents },
        update: {},
      });
    }

    // Finalize reservations: units leave stock exactly once. Reservations made
    // this impossible to oversell, so quantity covers qty by construction.
    for (const item of order.items) {
      const row = await findInventoryRow(tx, item.productId, item.variantId ?? null);
      if (!row) continue;
      await tx.inventory.update({
        where: { id: row.id },
        data: {
          quantity: row.quantity - item.qty,
          reserved: Math.max(0, row.reserved - item.qty),
        },
      });
    }

    await this.awardLoyalty(tx, order.customerId, payment.id, 'PURCHASE');

    if (order.status === 'PENDING') {
      await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
      await tx.orderStatusHistory.create({ data: { orderId: order.id, from: 'PENDING', to: 'PAID' } });
    }
    await this.notifyPaymentEvent(payment, 'PAYMENT_SUCCESSFUL');

    return { ok: true, captured: true };
  }

  /** Customer notice for payment outcomes (best-effort; never throws). */
  private async notifyPaymentEvent(
    payment: any,
    event: 'PAYMENT_SUCCESSFUL' | 'PAYMENT_FAILED',
    extra: Record<string, string> = {},
  ) {
    try {
      let reference = payment.providerRef ?? String(payment.id).slice(0, 8);
      if (payment.bookingId) {
        const b = await this.prisma.booking.findUnique({
          where: { id: payment.bookingId },
          select: { reference: true },
        });
        if (b) reference = b.reference;
      } else if (payment.orderId) {
        reference = `order ${String(payment.orderId).slice(0, 8)}`;
      }
      const customer = await this.prisma.user.findUnique({
        where: { id: payment.customerId },
        select: { name: true },
      });
      await this.notifications.notify(event, {
        userId: payment.customerId,
        data: {
          reference,
          amount: formatMoney(payment.grossCents, payment.currency),
          customerName: customer?.name ?? '',
          ...extra,
        },
      });
    } catch {
      // notify() already swallows errors; this is belt-and-braces.
    }
  }

  /** Release checkout reservations when the payment window expires. */  private async expireOrderHold(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.status !== 'PENDING') return;
    for (const item of order.items) {
      const row = await findInventoryRow(tx, item.productId, item.variantId ?? null);
      if (!row) continue;
      await tx.inventory.update({
        where: { id: row.id },
        data: { reserved: Math.max(0, row.reserved - item.qty) },
      });
    }
    await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
    await tx.orderStatusHistory.create({ data: { orderId, from: 'PENDING', to: 'CANCELLED' } });
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

        await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
        await tx.refund.create({
          data: { paymentId, amountCents: p.grossCents, reason: reason ?? 'Refund requested' },
        });
        await tx.paymentTransaction.create({
          data: { paymentId, type: 'REFUND', amountCents: p.grossCents, currency: p.currency },
        });
        if (p.bookingId) {
          await tx.providerEarning.updateMany({
            where: { bookingId: p.bookingId },
            data: { status: 'REVERSED', refundCents: p.grossCents },
          });
        }
        if (p.orderId) {
          await tx.providerEarning.updateMany({
            where: { orderId: p.orderId },
            data: { status: 'REVERSED', refundCents: p.grossCents },
          });
          // Sold units go back to stock (capture had deducted them).
          const order = await tx.order.findUnique({
            where: { id: p.orderId as string },
            include: { items: true },
          });
          if (order) {
            for (const item of order.items) {
              const row = await findInventoryRow(tx, item.productId, item.variantId ?? null);
              if (!row) continue;
              await tx.inventory.update({
                where: { id: row.id },
                data: { quantity: { increment: item.qty } },
              });
            }
            await tx.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
            await tx.orderStatusHistory.create({
              data: { orderId: order.id, from: order.status as any, to: 'REFUNDED' },
            });
          }
        }

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
    kind: 'BOOKING' | 'PURCHASE',
  ) {
    // Rule-based points via the loyalty engine (idempotent per payment).
    await this.loyalty.earnFromPayment(tx, { userId: customerId, paymentId, kind });
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
      orderId: p.orderId,
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
