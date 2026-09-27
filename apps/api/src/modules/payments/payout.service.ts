import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { formatMoney } from '../../common/money/money';

export interface PayoutActor {
  sub: string;
  role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SUPER_ADMIN' | 'SUPPORT';
}

export interface PayoutSummary {
  providerId: string;
  currency: string;
  // Canonical Phase-7 names
  grossEarningsCents: string;
  platformCommissionCents: string;
  paymentFeesCents: string;
  refundsCents: string;
  adjustmentsCents: string;
  pendingEarningsCents: string;
  availableEarningsCents: string;
  paidEarningsCents: string;
  paidOutCents: string;
  // Legacy aliases (kept for backward compatibility)
  totalGrossCents: string;
  totalCommissionCents: string;
  totalPaymentFeesCents: string;
  totalRefundCents: string;
  totalAdjustmentCents: string;
  totalNetCents: string;
  totalEarningsCents: string;
  totalPaidOutCents: string;
  availableBalanceCents: string;
}

export interface ReconciliationResult {
  paymentsCount: number;
  paymentsTotalCents: string;
  commissionCount: number;
  commissionTotalCents: string;
  paymentFeeCount: number;
  paymentFeeTotalCents: string;
  earningsCount: number;
  earningsTotalCents: string;
  payoutCount: number;
  payoutTotalCents: string;
  discrepancyCents: string;
  ledgerIntact: boolean;
  dateFrom: string;
  dateTo: string;
  // Extended Phase-7 detail
  refundsTotalCents?: string;
  adjustmentsTotalCents?: string;
  payoutsSuccessfulCents?: string;
  payoutsPendingCents?: string;
  orphanPaymentsMissingCommission?: string[];
  orphanPaymentsMissingEarning?: string[];
  orphanEarningsWithoutPayment?: string[];
  overPayoutCents?: string;
}

const MAX_PAYOUT_RETRIES = 3;

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- provider identity ---------------------------------------------------
  // Financial rows key provider by ProviderProfile.id, while auth actors carry
  // user id (sub). Resolve user -> profile so dashboards and payout filters
  // never silently return empty sets.

  private async resolveOwnProviderId(actor: PayoutActor): Promise<string> {
    try {
      const profiles: any = (this.prisma as any).providerProfile;
      if (profiles?.findUnique) {
        const byUser = await profiles.findUnique({ where: { userId: actor.sub } });
        if (byUser?.id) return byUser.id as string;
      }
    } catch {
      // fall through to legacy fallback (unit tests without profile mock)
    }
    return actor.sub;
  }

  private async resolveTargetProviderId(actor: PayoutActor, explicit?: string): Promise<string> {
    if (actor.role === 'PROVIDER') {
      const own = await this.resolveOwnProviderId(actor);
      if (!explicit) return own;
      if (explicit === actor.sub || explicit === own) return own;
      // Allow explicit profile id that resolves back to the same user.
      try {
        const profiles: any = (this.prisma as any).providerProfile;
        if (profiles?.findUnique) {
          const byId = await profiles.findUnique({ where: { id: explicit } });
          if (byId && (byId.userId === actor.sub || byId.id === own)) return byId.id as string;
        }
      } catch {
        // ignore
      }
      throw new ForbiddenException("Cannot view another provider's earnings");
    }
    // Admin / support / super-admin must name a provider for per-provider views.
    if (!explicit) throw new BadRequestException('providerId is required');
    try {
      const profiles: any = (this.prisma as any).providerProfile;
      if (profiles?.findUnique) {
        const byId = await profiles.findUnique({ where: { id: explicit } });
        if (byId?.id) return byId.id as string;
        const byUser = await profiles.findUnique({ where: { userId: explicit } });
        if (byUser?.id) return byUser.id as string;
      }
    } catch {
      // ignore — fall back to raw id (keeps unit tests working)
    }
    return explicit;
  }

  // --- provider earnings dashboard ----------------------------------------

  async getEarningsDashboard(actor: PayoutActor, providerId?: string): Promise<PayoutSummary> {
    if (actor.role === 'CUSTOMER') {
      throw new ForbiddenException('Customers cannot view provider earnings');
    }

    const targetProviderId = await this.resolveTargetProviderId(actor, providerId);

    const [earnings, payouts] = await Promise.all([
      this.prisma.providerEarning.findMany({
        where: { providerId: targetProviderId },
        select: {
          grossCents: true,
          commissionCents: true,
          feeCents: true,
          refundCents: true,
          adjustmentCents: true,
          netCents: true,
          status: true,
        },
      }),
      this.prisma.payout.findMany({
        where: { providerId: targetProviderId },
        select: { totalCents: true, status: true, currency: true },
      }),
    ]);

    const sum = (rows: any[], pick: (r: any) => bigint) => rows.reduce((s, r) => s + pick(r), 0n);
    const byStatus = (status: string) => earnings.filter((e) => (e as any).status === status);

    const gross = sum(earnings, (e) => (e as any).grossCents);
    const commission = sum(earnings, (e) => (e as any).commissionCents);
    const fees = sum(earnings, (e) => (e as any).feeCents);
    const refunds = sum(earnings, (e) => (e as any).refundCents);
    const adjustments = sum(earnings, (e) => (e as any).adjustmentCents);
    const net = sum(earnings, (e) => (e as any).netCents);

    const pending = sum(byStatus('PENDING'), (e) => (e as any).netCents);
    const available = sum(byStatus('AVAILABLE'), (e) => (e as any).netCents);
    const paid = sum(byStatus('PAID'), (e) => (e as any).netCents);

    const paidOut = payouts
      .filter((p) => (p as any).status === 'SUCCESSFUL')
      .reduce((s, p) => s + (p as any).totalCents, 0n);

    const currency = (payouts[0] as any)?.currency ?? 'KES';

    return {
      providerId: targetProviderId,
      currency,
      grossEarningsCents: gross.toString(),
      platformCommissionCents: commission.toString(),
      paymentFeesCents: fees.toString(),
      refundsCents: refunds.toString(),
      adjustmentsCents: adjustments.toString(),
      pendingEarningsCents: pending.toString(),
      availableEarningsCents: available.toString(),
      paidEarningsCents: paid.toString(),
      paidOutCents: paidOut.toString(),
      // legacy aliases
      totalGrossCents: gross.toString(),
      totalCommissionCents: commission.toString(),
      totalPaymentFeesCents: fees.toString(),
      totalRefundCents: refunds.toString(),
      totalAdjustmentCents: adjustments.toString(),
      totalNetCents: net.toString(),
      totalEarningsCents: net.toString(),
      totalPaidOutCents: paidOut.toString(),
      availableBalanceCents: available.toString(),
    };
  }

  // --- list payouts --------------------------------------------------------

  async listPayouts(actor: PayoutActor, query: { providerId?: string; status?: string; page?: number; pageSize?: number }) {
    if (actor.role === 'CUSTOMER') {
      throw new ForbiddenException('Customers cannot view payouts');
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.PayoutWhereInput = {};
    if (query.status) where.status = query.status as any;

    if (actor.role === 'PROVIDER') {
      where.providerId = await this.resolveOwnProviderId(actor);
    } else if (query.providerId) {
      where.providerId = await this.resolveTargetProviderId(actor, query.providerId);
    }

    const [items, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        include: { items: true, method: true } as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      data: items.map((p) => this.mapPayout(p)),
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 },
    };
  }

  // --- get payout detail ---------------------------------------------------

  async getPayout(actor: PayoutActor, payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { items: { include: { earning: true } }, method: true } as any,
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (actor.role === 'PROVIDER') {
      const own = await this.resolveOwnProviderId(actor);
      if ((payout as any).providerId !== own && (payout as any).providerId !== actor.sub) {
        throw new ForbiddenException('Cannot view this payout');
      }
    }
    return this.mapPayout(payout);
  }

  // --- create payout (admin; always backed by AVAILABLE earnings) ----------

  async createPayout(
    actor: PayoutActor,
    input: { providerId: string; methodId: string; earningIds: string[]; currency?: string },
  ) {
    // SECURITY: money creation is ADMIN/SUPER_ADMIN only (SUPPORT read-only).
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can create manual payouts');
    }
    if (!input.earningIds || input.earningIds.length === 0) {
      throw new BadRequestException('At least one earning is required to create a payout');
    }

    const providerId = await this.resolveTargetProviderId(actor, input.providerId);

    const method = await this.prisma.payoutMethod.findUnique({ where: { id: input.methodId } });
    if (!method || (method as any).providerId !== providerId) {
      throw new BadRequestException('Payout method does not belong to this provider');
    }

    const earnings = await this.prisma.providerEarning.findMany({
      where: { id: { in: input.earningIds }, providerId },
    });
    if (earnings.length !== input.earningIds.length) {
      throw new BadRequestException('One or more earnings not found for this provider');
    }
    const ineligible = earnings.filter((e) => (e as any).status !== 'AVAILABLE');
    if (ineligible.length > 0) {
      throw new BadRequestException(`${ineligible.length} earning(s) are not AVAILABLE and cannot be paid out`);
    }

    const totalCents = earnings.reduce((s, e) => s + (e as any).netCents, 0n);
    if (totalCents <= 0n) {
      throw new BadRequestException('Payout total must be positive');
    }

    const reference = `PO_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const payout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payout.create({
        data: {
          providerId,
          methodId: input.methodId,
          status: 'PENDING',
          totalCents,
          currency: input.currency ?? 'KES',
          reference,
        },
      });
      for (const earning of earnings) {
        await tx.payoutItem.create({
          data: {
            payoutId: created.id,
            earningId: (earning as any).id,
            amountCents: (earning as any).netCents,
          },
        });
      }
      return created;
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'payout.create',
      entity: 'payout',
      entityId: payout.id,
      after: {
        providerId,
        methodId: input.methodId,
        earningIds: input.earningIds,
        totalCents: totalCents.toString(),
        currency: input.currency ?? 'KES',
        reference,
      },
    });

    return this.mapPayout(
      await this.prisma.payout.findUnique({ where: { id: payout.id }, include: { items: true, method: true } as any }),
    );
  }

  // --- process payout (PENDING → PROCESSING → SUCCESSFUL/FAILED) ---------

  async processPayout(actor: PayoutActor, payoutId: string) {
    // SECURITY: providers must never self-approve/process their own payouts
    // (would let a provider mint settlements). Admin-only, defense in depth.
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can process payouts');
    }
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { items: { include: { earning: true } }, method: true } as any,
    });
    if (!payout) throw new NotFoundException('Payout not found');

    if ((payout as any).status !== 'PENDING') {
      throw new BadRequestException(`Cannot process payout in status ${(payout as any).status}`);
    }

    if (!((payout as any).items ?? []).length) {
      throw new BadRequestException('Cannot process a payout with no earning items');
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.payout.update({ where: { id: payoutId }, data: { status: 'PROCESSING' } });

        await this.audit.record({
          actorId: actor.sub, action: 'payout.process', entity: 'payout', entityId: payoutId,
          before: { status: 'PENDING' }, after: { status: 'PROCESSING' },
        });

        let totalPaidCents = 0n;
        let failedItems = 0;
        for (const item of (payout as any).items) {
          const earning = await tx.providerEarning.findUnique({ where: { id: item.earningId } });
          if (earning && ((earning as any).status === 'AVAILABLE' || (earning as any).status === 'PENDING')) {
            totalPaidCents += (earning as any).netCents;
            await tx.providerEarning.update({
              where: { id: item.earningId },
              data: { status: 'PAID' },
            });
            await tx.payoutItem.update({
              where: { id: item.id },
              data: { amountCents: (earning as any).netCents },
            });
          } else {
            failedItems++;
          }
        }

        if (totalPaidCents === 0n) {
          await tx.payout.update({
            where: { id: payoutId },
            data: { status: 'FAILED', failedCount: failedItems },
          });
          await this.audit.record({
            actorId: actor.sub, action: 'payout.fail', entity: 'payout', entityId: payoutId,
            before: { status: 'PROCESSING' }, after: { status: 'FAILED' },
            reason: `${failedItems} earning(s) not eligible`,
          });
        } else {
          await tx.payout.update({
            where: { id: payoutId },
            data: { status: 'SUCCESSFUL', totalCents: totalPaidCents, failedCount: failedItems },
          });
          await this.audit.record({
            actorId: actor.sub, action: 'payout.success', entity: 'payout', entityId: payoutId,
            before: { status: 'PROCESSING' },
            after: { status: 'SUCCESSFUL', totalCents: totalPaidCents.toString(), failedCount: failedItems },
          });
          await this.notifyPayoutCompleted(payout as any, totalPaidCents);
        }

        return this.mapPayout(await tx.payout.findUnique({ where: { id: payoutId }, include: { items: { include: { earning: true } }, method: true } as any }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // --- retry payout (FAILED → PENDING) with audit trail --------------------

  async retryPayout(actor: PayoutActor, payoutId: string) {
    // SECURITY: retry re-queues money movement — admin-only.
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can retry payouts');
    }
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if ((payout as any).status !== 'FAILED') {
      throw new BadRequestException(`Cannot retry payout in status ${(payout as any).status}`);
    }

    const retryCount = (((payout as any).retryCount ?? 0) as number) + 1;
    if (retryCount > MAX_PAYOUT_RETRIES) {
      throw new BadRequestException(`Max retries (${MAX_PAYOUT_RETRIES}) exceeded`);
    }

    await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'PENDING', retryCount },
    });

    await this.audit.record({
      actorId: actor.sub, action: 'payout.retry', entity: 'payout', entityId: payoutId,
      before: { status: 'FAILED', retryCount: retryCount - 1 },
      after: { status: 'PENDING', retryCount },
    });

    this.logger.log(`Payout ${payoutId} retried (attempt ${retryCount}/${MAX_PAYOUT_RETRIES}) by ${actor.sub}`);

    return this.mapPayout(await this.prisma.payout.findUnique({ where: { id: payoutId } }));
  }

  // --- force-fail payout (admin, for testing) ------------------------------

  async failPayout(actor: PayoutActor, payoutId: string, reason: string) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can force-fail payouts');
    }
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if ((payout as any).status !== 'PROCESSING' && (payout as any).status !== 'PENDING') {
      throw new BadRequestException(`Only PENDING or PROCESSING payouts can be forced to FAILED`);
    }

    await this.prisma.payout.update({ where: { id: payoutId }, data: { status: 'FAILED' } });

    await this.audit.record({
      actorId: actor.sub, action: 'payout.forceFail', entity: 'payout', entityId: payoutId,
      before: { status: (payout as any).status }, after: { status: 'FAILED' }, reason,
    });

    return this.mapPayout(await this.prisma.payout.findUnique({ where: { id: payoutId } }));
  }

  // --- reverse payout (SUCCESSFUL → REVERSED) ------------------------------

  async reversePayout(actor: PayoutActor, payoutId: string, reason?: string) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can reverse payouts');
    }
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { items: { include: { earning: true } } } as any,
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if ((payout as any).status !== 'SUCCESSFUL') {
      throw new BadRequestException(`Only SUCCESSFUL payouts can be reversed (current: ${(payout as any).status})`);
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.payout.update({ where: { id: payoutId }, data: { status: 'REVERSED' } });

        for (const item of (payout as any).items ?? []) {
          const earning = await tx.providerEarning.findUnique({ where: { id: item.earningId } });
          // Only restore earnings that are still marked PAID by this payout.
          // Earnings already REVERSED by a refund must stay reversed.
          if (earning && (earning as any).status === 'PAID') {
            await tx.providerEarning.update({
              where: { id: item.earningId },
              data: { status: 'AVAILABLE' },
            });
          }
        }

        await this.audit.record({
          actorId: actor.sub, action: 'payout.reverse', entity: 'payout', entityId: payoutId,
          before: { status: (payout as any).status }, after: { status: 'REVERSED' }, reason,
        });

        return this.mapPayout(await tx.payout.findUnique({ where: { id: payoutId }, include: { items: { include: { earning: true } }, method: true } as any }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // --- manual adjustment (admin; every adjustment is audited) --------------

  async adjustPayout(actor: PayoutActor, payoutId: string, amountCents: bigint, reason: string) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can adjust payouts');
    }
    if (!reason || !reason.trim()) {
      throw new BadRequestException('An audit reason is required for manual adjustments');
    }

    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if ((payout as any).status === 'REVERSED') {
      throw new BadRequestException('Cannot adjust a reversed payout');
    }

    const newTotal = (payout as any).totalCents + amountCents;
    if (newTotal < 0n) {
      throw new BadRequestException('Adjustment would result in negative payout total');
    }

    await this.prisma.payout.update({
      where: { id: payoutId },
      data: { totalCents: newTotal },
    });

    // The adjustment ledger IS the audit trail: every manual money movement is
    // recorded with before/after, actor, reason and timestamp. We deliberately
    // do NOT fabricate a PaymentTransaction row here — that table is FK-bound
    // to Payment and must never reference a Payout id.
    await this.audit.record({
      actorId: actor.sub, action: 'payout.adjustment', entity: 'payout', entityId: payoutId,
      before: { totalCents: ((payout as any).totalCents as bigint).toString() },
      after: { totalCents: newTotal.toString(), adjustmentCents: amountCents.toString() }, reason,
    });

    return {
      payoutId,
      amountCents: amountCents.toString(),
      newTotalCents: newTotal.toString(),
      currency: (payout as any).currency,
      reason,
      createdAt: new Date(),
    };
  }

  // --- admin dashboard -----------------------------------------------------

  async adminDashboard(actor: PayoutActor, query: { page?: number; pageSize?: number; status?: string; providerId?: string }) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'SUPPORT') {
      throw new ForbiddenException('Only admins can view payout dashboard');
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.PayoutWhereInput = {};
    if (query.status) where.status = query.status as any;
    if (query.providerId) where.providerId = query.providerId;

    const [payouts, total, failedCount, successfulCount, pendingCount, processingCount, reversedCount] = await Promise.all([
      this.prisma.payout.findMany({
        where, include: { method: true, items: true } as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payout.count({ where }),
      this.prisma.payout.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.payout.count({ where: { ...where, status: 'SUCCESSFUL' } }),
      this.prisma.payout.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.payout.count({ where: { ...where, status: 'PROCESSING' } }),
      this.prisma.payout.count({ where: { ...where, status: 'REVERSED' } }),
    ]);

    const failedPayouts = payouts.filter((p) => (p as any).status === 'FAILED');

    return {
      data: {
        payouts: payouts.map((p) => this.mapPayout(p)),
        summary: {
          totalPayouts: total,
          failedCount,
          successfulCount,
          pendingCount,
          processingCount,
          reversedCount,
        },
        failedPayouts: failedPayouts.map((p) => this.mapPayout(p)),
      },
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 },
    };
  }

  // --- transaction detail --------------------------------------------------
  // Payout has no direct PaymentTransaction FK (those belong to Payment), so
  // the full money trail is assembled: payout -> earnings -> bookings/payments
  // -> ledger transactions, plus the payout audit trail.

  async getTransactionDetail(actor: PayoutActor, payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        items: { include: { earning: true } },
        method: true,
      } as any,
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (actor.role === 'PROVIDER') {
      const own = await this.resolveOwnProviderId(actor);
      if ((payout as any).providerId !== own && (payout as any).providerId !== actor.sub) {
        throw new ForbiddenException('Cannot view this payout');
      }
    }
    const p = payout as any;

    const bookingIds = (p.items ?? []).map((i: any) => i.earning?.bookingId).filter(Boolean);
    let ledgerTransactions: any[] = [];
    let relatedPayments: any[] = [];
    try {
      if (bookingIds.length) {
        const payments = await this.prisma.payment.findMany({ where: { bookingId: { in: bookingIds } } });
        relatedPayments = payments.map((pay: any) => ({
          id: pay.id,
          bookingId: pay.bookingId,
          status: pay.status,
          grossCents: pay.grossCents?.toString?.() ?? String(pay.grossCents),
          commissionCents: pay.commissionCents?.toString?.() ?? String(pay.commissionCents),
          netCents: pay.netCents?.toString?.() ?? String(pay.netCents),
          currency: pay.currency,
        }));
        if (payments.length) {
          const txns = await this.prisma.paymentTransaction.findMany({
            where: { paymentId: { in: payments.map((x: any) => x.id) } },
            orderBy: { createdAt: 'asc' },
          });
          ledgerTransactions = txns.map((t: any) => ({
            id: t.id,
            paymentId: t.paymentId,
            type: t.type,
            amountCents: t.amountCents.toString(),
            currency: t.currency,
            createdAt: t.createdAt,
          }));
        }
      }
    } catch {
      ledgerTransactions = [];
    }

    let auditTrail: any[] = [];
    try {
      const logs = await (this.prisma as any).auditLog?.findMany?.({
        where: { entity: 'payout', entityId: payoutId },
        orderBy: { createdAt: 'asc' },
      });
      auditTrail = (logs ?? []).map((l: any) => ({
        id: l.id,
        action: l.action,
        actorId: l.actorId,
        before: l.before,
        after: l.after,
        createdAt: l.createdAt,
      }));
    } catch {
      auditTrail = [];
    }

    return {
      id: p.id,
      providerId: p.providerId,
      method: p.method ? { type: p.method.type, detailsRef: p.method.detailsRef } : null,
      status: p.status,
      totalCents: p.totalCents.toString(),
      currency: p.currency,
      reference: p.reference,
      retryCount: p.retryCount ?? 0,
      failedCount: p.failedCount ?? 0,
      items: (p.items ?? []).map((i: any) => ({
        id: i.id,
        earningId: i.earningId,
        earningStatus: i.earning?.status,
        earningGrossCents: i.earning?.grossCents?.toString?.() ?? null,
        earningNetCents: i.earning?.netCents?.toString?.() ?? null,
        bookingId: i.earning?.bookingId ?? null,
        amountCents: i.amountCents?.toString() ?? '0',
      })),
      relatedPayments,
      transactions: ledgerTransactions,
      auditTrail,
      createdAt: p.createdAt,
    };
  }

  // --- reconciliation ------------------------------------------------------
  // Invariant (no money disappears):
  //   Σ SUCCESSFUL payments.gross
  //     == Σ commissions + Σ active earnings.fee + Σ active earnings.net
  // plus referential checks: every successful payment must have a commission
  // row and an earning; every active earning must trace to a successful
  // payment; successful payouts must never exceed active earnings net.

  async reconcile(actor: PayoutActor, query: { providerId?: string; dateFrom?: Date; dateTo?: Date }): Promise<ReconciliationResult> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'SUPPORT') {
      throw new ForbiddenException('Only admins can run reconciliation');
    }

    let providerId: string | undefined;
    if (query.providerId) {
      providerId = await this.resolveTargetProviderId(actor, query.providerId);
    }

    const dateFilter = (field = 'createdAt') => {
      const f: any = {};
      if (query.dateFrom) f.gte = query.dateFrom;
      if (query.dateTo) f.lte = query.dateTo;
      return Object.keys(f).length ? { [field]: f } : {};
    };

    const paymentWhere: Prisma.PaymentWhereInput = {
      status: 'SUCCESSFUL',
      ...dateFilter(),
      ...(providerId ? { providerId } : {}),
    };

    const payments = await this.prisma.payment.findMany({
      where: paymentWhere,
      select: { id: true, bookingId: true, orderId: true, grossCents: true, feeCents: true, commissionCents: true },
    });
    const paymentIds = payments.map((x) => x.id);
    // Link key covers both booking and order payments: no transaction may
    // disappear between payment → commission → earning → payout.
    const paymentLinkIds = new Set(
      payments.map((x) => (x as any).bookingId ?? (x as any).orderId).filter(Boolean) as string[],
    );

    const [commissions, feeTxns, earnings, payouts] = await Promise.all([
      paymentIds.length
        ? this.prisma.commission.findMany({ where: { paymentId: { in: paymentIds } }, select: { paymentId: true, commissionCents: true, rateBasisPoints: true } })
        : [],
      paymentIds.length
        ? this.prisma.paymentTransaction.findMany({ where: { paymentId: { in: paymentIds }, type: 'FEE' }, select: { amountCents: true } })
        : [],
      this.prisma.providerEarning.findMany({
        where: { ...(providerId ? { providerId } : {}), ...dateFilter() },
        select: { id: true, bookingId: true, orderId: true, grossCents: true, commissionCents: true, feeCents: true, netCents: true, status: true },
      }),
      this.prisma.payout.findMany({
        where: { ...(providerId ? { providerId } : {}), ...dateFilter() },
        select: { id: true, totalCents: true, status: true },
      }),
    ]);

    const paymentsTotal = payments.reduce((s, x) => s + (x as any).grossCents, 0n);
    const commissionsTotal = commissions.reduce((s, x) => s + (x as any).commissionCents, 0n);
    const feeTxnTotal = feeTxns.reduce((s, x) => s + (x as any).amountCents, 0n);

    const activeEarnings = earnings.filter((e) => (e as any).status !== 'REVERSED');
    const earningsNet = activeEarnings.reduce((s, x) => s + (x as any).netCents, 0n);
    const earningsFee = activeEarnings.reduce((s, x) => s + (x as any).feeCents, 0n);
    const totalFee = earningsFee + feeTxnTotal;
    const refundsTotal = earnings
      .filter((e) => (e as any).status === 'REVERSED')
      .reduce((s, x) => s + (x as any).netCents, 0n);
    const adjustmentsTotal = earnings.reduce((s, x) => s + ((x as any).adjustmentCents ?? 0n), 0n);

    const payoutsSuccessful = payouts
      .filter((x) => (x as any).status === 'SUCCESSFUL')
      .reduce((s, x) => s + (x as any).totalCents, 0n);
    const payoutsPending = payouts
      .filter((x) => ['PENDING', 'PROCESSING'].includes((x as any).status))
      .reduce((s, x) => s + (x as any).totalCents, 0n);
    const payoutsTotal = payouts.reduce((s, x) => s + (x as any).totalCents, 0n);

    // Referential integrity (booking- and order-linked alike)
    const commissionByPayment = new Set(commissions.map((c) => (c as any).paymentId));
    // Platform-owned orders keep 100% margin as commission (no seller earning
    // expected) — they are fully reconciled without an earning row.
    const platformKept = new Set(
      commissions.filter((c) => (c as any).rateBasisPoints === 10000).map((c) => (c as any).paymentId),
    );
    const earningLinkIds = new Set(
      activeEarnings.map((e) => (e as any).bookingId ?? (e as any).orderId).filter(Boolean),
    );
    const orphanPaymentsMissingCommission = payments.filter((x) => !commissionByPayment.has(x.id)).map((x) => x.id);
    const orphanPaymentsMissingEarning = payments
      .filter((x) => ((x as any).bookingId ?? (x as any).orderId) && !platformKept.has(x.id) && !earningLinkIds.has(((x as any).bookingId ?? (x as any).orderId) as string))
      .map((x) => x.id);
    const orphanEarningsWithoutPayment = activeEarnings
      .filter((e) => ((e as any).bookingId ?? (e as any).orderId) && !paymentLinkIds.has(((e as any).bookingId ?? (e as any).orderId) as string))
      .map((e) => (e as any).id);

    const discrepancy = paymentsTotal - commissionsTotal - totalFee - earningsNet;
    const overPayout = payoutsSuccessful > earningsNet ? payoutsSuccessful - earningsNet : 0n;
    const ledgerIntact =
      discrepancy === 0n &&
      overPayout === 0n &&
      orphanPaymentsMissingCommission.length === 0 &&
      orphanPaymentsMissingEarning.length === 0 &&
      orphanEarningsWithoutPayment.length === 0;

    return {
      paymentsCount: payments.length,
      paymentsTotalCents: paymentsTotal.toString(),
      commissionCount: commissions.length,
      commissionTotalCents: commissionsTotal.toString(),
      paymentFeeCount: feeTxns.length + activeEarnings.filter((e) => (e as any).feeCents > 0n).length,
      paymentFeeTotalCents: totalFee.toString(),
      earningsCount: activeEarnings.length,
      earningsTotalCents: earningsNet.toString(),
      payoutCount: payouts.length,
      payoutTotalCents: payoutsTotal.toString(),
      discrepancyCents: discrepancy.toString(),
      ledgerIntact,
      dateFrom: query.dateFrom?.toISOString() ?? 'epoch',
      dateTo: query.dateTo?.toISOString() ?? 'now',
      refundsTotalCents: refundsTotal.toString(),
      adjustmentsTotalCents: adjustmentsTotal.toString(),
      payoutsSuccessfulCents: payoutsSuccessful.toString(),
      payoutsPendingCents: payoutsPending.toString(),
      orphanPaymentsMissingCommission,
      orphanPaymentsMissingEarning,
      orphanEarningsWithoutPayment,
      overPayoutCents: overPayout.toString(),
    };
  }

  // --- helpers -------------------------------------------------------------

  /** Provider notice on settlement (best-effort; never throws). */
  private async notifyPayoutCompleted(payout: any, totalCents: bigint) {
    try {
      const profile = await (this.prisma as any).providerProfile?.findUnique?.({
        where: { id: payout.providerId },
        select: { userId: true, businessName: true },
      });
      if (!profile?.userId) return;
      const method = payout.methodId ? await this.prisma.payoutMethod.findUnique({ where: { id: payout.methodId } }) : null;
      await this.notifications.notify('PAYOUT_COMPLETED', {
        userId: profile.userId,
        data: {
          reference: payout.reference ?? payout.id.slice(0, 8),
          amount: formatMoney(totalCents, payout.currency ?? 'KES'),
          method: (method as any)?.type ?? 'payout method',
          providerName: profile.businessName ?? '',
        },
      });
    } catch {
      // notify() already swallows errors; belt-and-braces.
    }
  }

  private mapPayout(p: any) {
    if (!p) return p;
    const pp = p as any;
    return {
      id: pp.id,
      providerId: pp.providerId,
      methodId: pp.methodId,
      method: pp.method ? { id: pp.method.id, type: pp.method.type, detailsRef: pp.method.detailsRef, isDefault: pp.method.isDefault } : null,
      status: pp.status,
      totalCents: pp.totalCents?.toString?.() ?? String(pp.totalCents),
      currency: pp.currency,
      reference: pp.reference,
      retryCount: pp.retryCount ?? 0,
      failedCount: pp.failedCount ?? 0,
      items: (pp.items ?? []).map((i: any) => ({
        id: i.id,
        earningId: i.earningId,
        amountCents: i.amountCents?.toString?.() ?? '0',
        earningStatus: i.earning?.status,
      })),
      createdAt: pp.createdAt,
    };
  }
}
