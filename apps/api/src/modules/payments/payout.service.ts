import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface PayoutActor {
  sub: string;
  role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SUPER_ADMIN' | 'SUPPORT';
}

export interface PayoutSummary {
  providerId: string;
  totalGrossCents: string;
  totalCommissionCents: string;
  totalRefundCents: string;
  totalAdjustmentCents: string;
  totalNetCents: string;
  totalEarningsCents: string;
  totalPaidOutCents: string;
  pendingEarningsCents: string;
  availableEarningsCents: string;
}

export interface ReconciliationResult {
  paymentsCount: number;
  paymentsTotalCents: string;
  commissionCount: number;
  commissionTotalCents: string;
  earningsCount: number;
  earningsTotalCents: string;
  payoutCount: number;
  payoutTotalCents: string;
  discrepancyCents: string;
  dateFrom: string;
  dateTo: string;
}

@Injectable()
export class PayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- provider earnings dashboard ----------------------------------------

  async getEarningsDashboard(actor: PayoutActor, providerId?: string): Promise<PayoutSummary> {
    const targetProviderId = providerId ?? actor.sub;

    if (actor.role === 'CUSTOMER') {
      throw new ForbiddenException('Customers cannot view provider earnings');
    }

    if (actor.role === 'PROVIDER' && actor.sub !== targetProviderId) {
      throw new ForbiddenException('Cannot view another provider\'s earnings');
    }

    const [earnings, payouts, payments] = await Promise.all([
      this.prisma.providerEarning.findMany({
        where: { providerId: targetProviderId },
        select: { grossCents: true, commissionCents: true, feeCents: true, refundCents: true, adjustmentCents: true, netCents: true, status: true },
      }),
      this.prisma.payout.findMany({
        where: { providerId: targetProviderId },
        select: { totalCents: true, status: true },
      }),
      this.prisma.payment.findMany({
        where: { providerId: targetProviderId, status: 'SUCCESSFUL' },
        select: { grossCents: true, commissionCents: true, netCents: true },
      }),
    ]);

    const totalGrossCents = earnings.reduce((sum, e) => sum + e.grossCents, 0n);
    const totalCommissionCents = earnings.reduce((sum, e) => sum + e.commissionCents, 0n);
    const totalRefundCents = earnings.reduce((sum, e) => sum + e.refundCents, 0n);
    const totalAdjustmentCents = earnings.reduce((sum, e) => sum + e.adjustmentCents, 0n);
    const totalNetCents = earnings.reduce((sum, e) => sum + e.netCents, 0n);
    const totalPaidOutCents = payouts
      .filter((p) => p.status === 'SUCCESSFUL')
      .reduce((sum, p) => sum + p.totalCents, 0n);

    const pendingEarningsCents = earnings
      .filter((e) => e.status === 'PENDING' || e.status === 'AVAILABLE')
      .reduce((sum, e) => sum + e.netCents, 0n);

    return {
      providerId: targetProviderId,
      totalGrossCents: totalGrossCents.toString(),
      totalCommissionCents: totalCommissionCents.toString(),
      totalRefundCents: totalRefundCents.toString(),
      totalAdjustmentCents: totalAdjustmentCents.toString(),
      totalNetCents: totalNetCents.toString(),
      totalEarningsCents: totalNetCents.toString(),
      totalPaidOutCents: totalPaidOutCents.toString(),
      pendingEarningsCents: pendingEarningsCents.toString(),
      availableEarningsCents: pendingEarningsCents.toString(),
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
    if (query.providerId) where.providerId = query.providerId;
    if (query.status) where.status = query.status as any;

    if (actor.role === 'PROVIDER') {
      where.providerId = actor.sub;
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
      include: { items: true, method: true } as any,
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (actor.role === 'PROVIDER' && payout.providerId !== actor.sub) {
      throw new ForbiddenException('Cannot view this payout');
    }
    return this.mapPayout(payout);
  }

  // --- create payout (admin/manual) ---------------------------------------

  async createPayout(actor: PayoutActor, input: { providerId: string; methodId: string; totalCents: bigint; currency: string }) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'SUPPORT') {
      throw new ForbiddenException('Only admins can create manual payouts');
    }

    const payout = await this.prisma.payout.create({
      data: {
        providerId: input.providerId,
        methodId: input.methodId,
        status: 'PENDING',
        totalCents: input.totalCents,
        currency: input.currency,
        reference: `PO_${Date.now().toString(36).toUpperCase()}`,
      },
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'payout.create',
      entity: 'payout',
      entityId: payout.id,
      after: { totalCents: input.totalCents.toString(), currency: input.currency },
    });

    return this.mapPayout(payout);
  }

  // --- process payout (transition PENDING → PROCESSING → SUCCESSFUL/FAILED)

  async processPayout(actor: PayoutActor, payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { items: { include: { earning: true } }, method: true } as any,
    });
    if (!payout) throw new NotFoundException('Payout not found');

    if (payout.status !== 'PENDING') {
      throw new BadRequestException(`Cannot process payout in status ${payout.status}`);
    }

    if (actor.role === 'PROVIDER' && payout.providerId !== actor.sub) {
      throw new ForbiddenException('Cannot process this payout');
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Transition to PROCESSING
        await tx.payout.update({
          where: { id: payoutId },
          data: { status: 'PROCESSING' },
        });

        await this.audit.record({
          actorId: actor.sub,
          action: 'payout.process',
          entity: 'payout',
          entityId: payoutId,
          before: { status: 'PENDING' },
          after: { status: 'PROCESSING' },
        });

        // Update provider earnings and payout items
        let totalPaidCents = 0n;
        for (const item of payout.items) {
          const earning = await tx.providerEarning.findUnique({ where: { id: item.earningId } });
          if (earning && (earning.status === 'PENDING' || earning.status === 'AVAILABLE')) {
            totalPaidCents += earning.netCents;
            await tx.providerEarning.update({
              where: { id: item.earningId },
              data: { status: 'PAID' },
            });
            await tx.payoutItem.update({
              where: { id: item.id },
              data: { amountCents: earning.netCents },
            });
          }
        }

        // Transition to SUCCESSFUL
        await tx.payout.update({
          where: { id: payoutId },
          data: { status: 'SUCCESSFUL', totalCents: totalPaidCents || payout.totalCents },
        });

        await this.audit.record({
          actorId: actor.sub,
          action: 'payout.success',
          entity: 'payout',
          entityId: payoutId,
          before: { status: 'PROCESSING' },
          after: { status: 'SUCCESSFUL' },
        });

        return this.mapPayout(await tx.payout.findUnique({ where: { id: payoutId }, include: { items: true, method: true } as any }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // --- retry payout (FAILED → PENDING)

  async retryPayout(actor: PayoutActor, payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'FAILED') {
      throw new BadRequestException(`Cannot retry payout in status ${payout.status}`);
    }

    await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'PENDING' },
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'payout.retry',
      entity: 'payout',
      entityId: payoutId,
      before: { status: 'FAILED' },
      after: { status: 'PENDING' },
    });

    return this.mapPayout(await this.prisma.payout.findUnique({ where: { id: payoutId } }));
  }

  // --- reverse payout (REVERSED) ------------------------------------------

  async reversePayout(actor: PayoutActor, payoutId: string, reason?: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { items: true } as any,
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'SUCCESSFUL') {
      throw new BadRequestException(`Only successful payouts can be reversed`);
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.payout.update({
          where: { id: payoutId },
          data: { status: 'REVERSED' },
        });

        for (const item of payout.items) {
          await tx.providerEarning.update({
            where: { id: item.earningId },
            data: { status: 'AVAILABLE' },
          });
        }

        await this.audit.record({
          actorId: actor.sub,
          action: 'payout.reverse',
          entity: 'payout',
          entityId: payoutId,
          before: { status: 'SUCCESSFUL' },
          after: { status: 'REVERSED' },
          reason,
        });

return this.mapPayout(await tx.payout.findUnique({ where: { id: payoutId }, include: { items: true, method: true } as any }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // --- adjustment (admin/manual, always audited) --------------------------

  async adjustPayout(actor: PayoutActor, payoutId: string, amountCents: bigint, reason: string) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'SUPPORT') {
      throw new ForbiddenException('Only admins can adjust payouts');
    }

    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status === 'REVERSED') {
      throw new BadRequestException('Cannot adjust a reversed payout');
    }

    const adjustment = await this.prisma.paymentTransaction.create({
      data: {
        paymentId: payout.id,
        type: 'ADJUSTMENT',
        amountCents,
        currency: payout.currency,
      },
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'payout.adjustment',
      entity: 'payout',
      entityId: payoutId,
      before: { totalCents: payout.totalCents.toString() },
      after: { totalCents: (payout.totalCents + amountCents).toString(), adjustmentId: adjustment.id },
      reason,
    });

    return { id: adjustment.id, amountCents: amountCents.toString(), reason, createdAt: adjustment.createdAt };
  }

  // --- reconciliation ------------------------------------------------------

  async reconcile(actor: PayoutActor, query: { providerId?: string; dateFrom?: Date; dateTo?: Date }): Promise<ReconciliationResult> {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'SUPPORT') {
      throw new ForbiddenException('Only admins can run reconciliation');
    }

    const wherePayment: Prisma.PaymentWhereInput = { status: 'SUCCESSFUL' };
    if (query.providerId) wherePayment.providerId = query.providerId;
    if (query.dateFrom) wherePayment.createdAt = { gte: query.dateFrom };
    if (query.dateTo) wherePayment.createdAt = { lte: query.dateTo };

    const [payments, commissions, earnings, payouts] = await Promise.all([
      this.prisma.payment.findMany({ where: wherePayment, select: { grossCents: true } }),
      this.prisma.commission.findMany({ where: { payment: { status: 'SUCCESSFUL' } }, select: { commissionCents: true } }),
      this.prisma.providerEarning.findMany({ where: { providerId: query.providerId }, select: { netCents: true } }),
      this.prisma.payout.findMany({ where: { providerId: query.providerId }, select: { totalCents: true, status: true } }),
    ]);

    const paymentsTotalCents = payments.reduce((sum, p) => sum + p.grossCents, 0n);
    const commissionTotalCents = commissions.reduce((sum, c) => sum + c.commissionCents, 0n);
    const earningsTotalCents = earnings.reduce((sum, e) => sum + e.netCents, 0n);
    const payoutTotalCents = payouts.reduce((sum, p) => sum + p.totalCents, 0n);
    const discrepancyCents = paymentsTotalCents - commissionTotalCents - earningsTotalCents;

    return {
      paymentsCount: payments.length,
      paymentsTotalCents: paymentsTotalCents.toString(),
      commissionCount: commissions.length,
      commissionTotalCents: commissionTotalCents.toString(),
      earningsCount: earnings.length,
      earningsTotalCents: earningsTotalCents.toString(),
      payoutCount: payouts.length,
      payoutTotalCents: payoutTotalCents.toString(),
      discrepancyCents: discrepancyCents.toString(),
      dateFrom: query.dateFrom?.toISOString() ?? 'epoch',
      dateTo: query.dateTo?.toISOString() ?? 'now',
    };
  }

  // --- helpers -------------------------------------------------------------

  private mapPayout(p: any) {
    return {
      id: p.id,
      providerId: p.providerId,
      methodId: p.methodId,
      method: p.method ? { id: p.method.id, type: p.method.type, detailsRef: p.method.detailsRef, isDefault: p.method.isDefault } : null,
      status: p.status,
      totalCents: p.totalCents.toString(),
      currency: p.currency,
      reference: p.reference,
      items: (p.items ?? []).map((i: any) => ({
        id: i.id,
        earningId: i.earningId,
        amountCents: i.amountCents?.toString() ?? '0',
      })),
      createdAt: p.createdAt,
    };
  }
}
