import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';

export type LoyaltyEvent = 'BOOKING' | 'REVIEW' | 'REFERRAL' | 'PURCHASE' | 'SIGNUP';

const EVENT_TXN_TYPE: Record<LoyaltyEvent, string> = {
  BOOKING: 'EARN_BOOKING',
  REVIEW: 'EARN_REVIEW',
  REFERRAL: 'EARN_REFERRAL',
  PURCHASE: 'EARN_PURCHASE',
  SIGNUP: 'BONUS',
};

const EVENT_REASON: Record<LoyaltyEvent, string> = {
  BOOKING: 'Completed booking payment',
  REVIEW: 'Verified review published',
  REFERRAL: 'Referral reward',
  PURCHASE: 'Product purchase',
  SIGNUP: 'Welcome bonus',
};

const DEFAULT_RULES: Array<{ event: LoyaltyEvent; points: number }> = [
  { event: 'BOOKING', points: 20 },
  { event: 'REVIEW', points: 5 },
  { event: 'REFERRAL', points: 50 },
  { event: 'PURCHASE', points: 10 },
  { event: 'SIGNUP', points: 10 },
];

const DEFAULT_TIERS = [
  { id: 'new', name: 'NEW', threshold: 0 },
  { id: 'bronze', name: 'BRONZE', threshold: 100 },
  { id: 'silver', name: 'SILVER', threshold: 500 },
  { id: 'gold', name: 'GOLD', threshold: 1500 },
  { id: 'platinum', name: 'PLATINUM', threshold: 5000 },
  { id: 'vip', name: 'VIP', threshold: 15000 },
];

/**
 * Rule-based retention engine. Every points change writes a ledger row —
 * balances are never overwritten, only moved by transactions. Points are
 * plain integers (NOT cents). Tier = highest threshold at/under lifetime
 * earned points (redemptions never demote).
 */
@Injectable()
export class LoyaltyService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly analytics?: AnalyticsService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSeeded(this.prisma);
    } catch {
      // DB may be unavailable in some contexts; seed lazily on first earn.
    }
  }

  /** Seed default rules/tiers without clobbering admin edits. */
  async ensureSeeded(db: any) {
    const [rules, tiers] = await Promise.all([
      db.loyaltyRule.findMany({ select: { event: true } }),
      db.loyaltyTier.findMany({ select: { id: true } }),
    ]);
    const haveRules = new Set((rules ?? []).map((r: any) => r.event));
    const haveTiers = new Set((tiers ?? []).map((t: any) => t.id));
    for (const r of DEFAULT_RULES) {
      if (!haveRules.has(r.event)) {
        await db.loyaltyRule.create({ data: { event: r.event, points: r.points, active: true } });
      }
    }
    for (const t of DEFAULT_TIERS) {
      if (!haveTiers.has(t.id)) {
        await db.loyaltyTier.create({
          data: { id: t.id, name: t.name, thresholdCents: BigInt(t.threshold) },
        });
      }
    }
  }

  /**
   * Award rule-based points. Idempotent per (type, refType, refId): safe to
   * call from webhooks that may redeliver. Returns null when no active rule.
   */
  async earn(
    db: any,
    input: { userId: string; event: LoyaltyEvent; refType: string; refId: string; reason?: string },
  ) {
    await this.ensureSeeded(db);
    const rule = await db.loyaltyRule.findUnique({ where: { event: input.event } });
    if (!rule?.active || (rule.points as number) <= 0) return null;

    const type = EVENT_TXN_TYPE[input.event];
    // Global idempotency guard first (cheap, covers existing accounts).
    const dup = await db.loyaltyTransaction.findFirst({
      where: { refType: input.refType, refId: input.refId, type },
    });
    if (dup) {
      const account = await db.loyaltyAccount.findUnique({ where: { id: dup.accountId } });
      return { account, transaction: dup, tier: null, duplicate: true };
    }

    // LoyaltyAccount.customerId → CustomerProfile.id: ensure the profile row
    // exists (nothing else in the codebase creates it yet).
    const profile = await db.customerProfile.upsert({
      where: { userId: input.userId },
      update: {},
      create: { userId: input.userId },
    });
    let account = await db.loyaltyAccount.findUnique({ where: { customerId: profile.id } });
    if (!account) {
      account = await db.loyaltyAccount.create({
        data: { customerId: profile.id, tierId: 'new', balanceCents: 0n },
      });
    }

    const txn = await db.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type,
        deltaCents: BigInt(rule.points),
        reason: input.reason ?? EVENT_REASON[input.event],
        refType: input.refType,
        refId: input.refId,
      },
    });
    account = await db.loyaltyAccount.update({
      where: { id: account.id },
      data: { balanceCents: { increment: BigInt(rule.points) } },
    });
    const tier = await this.refreshTier(db, account.id);
    // Retention notice (best-effort; notify() never throws).
    await this.notifications.notify('REWARD_EARNED', {
      userId: input.userId,
      data: {
        points: String(rule.points),
        reason: input.reason ?? EVENT_REASON[input.event],
        balance: (account.balanceCents as bigint).toString(),
        customerName: '',
      },
    });
    await this.analytics?.track('POINTS_EARNED', {
      userId: input.userId,
      payload: { event: input.event, points: rule.points, refType: input.refType, refId: input.refId },
    });
    return { account: { ...account, tierId: tier.id }, transaction: txn, tier, duplicate: false };
  }

  /** Payment-webhook entry: BOOKING for service payments, PURCHASE for orders. */
  async earnFromPayment(
    tx: any,
    input: { userId: string; paymentId: string; kind: 'BOOKING' | 'PURCHASE' },
  ) {
    return this.earn(tx, {
      userId: input.userId,
      event: input.kind,
      refType: 'PAYMENT',
      refId: input.paymentId,
    });
  }

  async awardSignup(userId: string) {
    return this.earn(this.prisma, {
      userId,
      event: 'SIGNUP',
      refType: 'USER',
      refId: userId,
      reason: 'Welcome bonus',
    });
  }

  /** Recompute tier from lifetime earned points (redemptions never demote). */
  async refreshTier(db: any, accountId: string) {
    const txns: Array<{ deltaCents: bigint }> = await db.loyaltyTransaction.findMany({
      where: { accountId, type: { not: 'REDEEM' } },
      select: { deltaCents: true },
    });
    const lifetime = txns.reduce((s, t) => s + (t.deltaCents > 0n ? t.deltaCents : 0n), 0n);
    const tiers: Array<{ id: string; name: string; thresholdCents: bigint }> =
      await db.loyaltyTier.findMany({ orderBy: { thresholdCents: 'asc' } });
    let current = tiers[0] ?? { id: 'new', name: 'NEW', thresholdCents: 0n };
    for (const t of tiers) {
      if (t.thresholdCents <= lifetime) current = t;
    }
    const account = await db.loyaltyAccount.findUnique({ where: { id: accountId } });
    if (account && account.tierId !== current.id) {
      await db.loyaltyAccount.update({ where: { id: accountId }, data: { tierId: current.id } });
    }
    return { ...current, lifetime: lifetime.toString() };
  }

  async getAccount(userId: string) {
    await this.ensureSeeded(this.prisma);
    const profile = await this.prisma.customerProfile.findUnique({ where: { userId } });
    const tiers = await this.prisma.loyaltyTier.findMany({ orderBy: { thresholdCents: 'asc' } });
    if (!profile) {
      return { balance: '0', lifetime: '0', tier: { id: 'new', name: 'NEW' }, tiers: this.mapTiers(tiers) };
    }
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { customerId: profile.id } });
    if (!account) {
      return { balance: '0', lifetime: '0', tier: { id: 'new', name: 'NEW' }, tiers: this.mapTiers(tiers) };
    }
    const txns = await this.prisma.loyaltyTransaction.findMany({
      where: { accountId: account.id, type: { not: 'REDEEM' } },
      select: { deltaCents: true },
    });
    const lifetime = txns.reduce((s: bigint, t: any) => s + (t.deltaCents > 0n ? t.deltaCents : 0n), 0n);
    const tier = tiers.find((t) => t.id === account.tierId) ?? { id: account.tierId, name: account.tierId.toUpperCase() };
    return {
      balance: account.balanceCents.toString(),
      lifetime: lifetime.toString(),
      tier: { id: tier.id, name: (tier as any).name },
      tiers: this.mapTiers(tiers),
    };
  }

  async history(userId: string, page = 1, pageSize = 20) {
    const profile = await this.prisma.customerProfile.findUnique({ where: { userId } });
    if (!profile) return { data: [], meta: { page, pageSize, total: 0, pages: 0 } };
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { customerId: profile.id } });
    if (!account) return { data: [], meta: { page, pageSize, total: 0, pages: 0 } };
    const [rows, total] = await Promise.all([
      this.prisma.loyaltyTransaction.findMany({
        where: { accountId: account.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.loyaltyTransaction.count({ where: { accountId: account.id } }),
    ]);
    return {
      data: rows.map((t) => ({
        id: t.id,
        type: t.type,
        points: t.deltaCents.toString(),
        reason: t.reason,
        createdAt: t.createdAt,
      })),
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 },
    };
  }

  // --- rewards --------------------------------------------------------------------

  async listRewards(activeOnly = true) {
    const rewards = await this.prisma.reward.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { costCents: 'asc' },
    });
    return rewards.map((r) => ({ id: r.id, name: r.name, cost: r.costCents.toString(), active: r.active }));
  }

  async createReward(actorId: string, input: { name: string; cost: number; active?: boolean }) {
    const reward = await this.prisma.reward.create({
      data: { name: input.name, costCents: BigInt(input.cost), active: input.active ?? true },
    });
    await this.audit.record({
      actorId, action: 'reward.create', entity: 'reward', entityId: reward.id, after: input as any,
    });
    return { id: reward.id, name: reward.name, cost: reward.costCents.toString(), active: reward.active };
  }

  async updateReward(actorId: string, id: string, input: { name?: string; cost?: number; active?: boolean }) {
    const existing = await this.prisma.reward.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Reward not found');
    const updated = await this.prisma.reward.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        costCents: input.cost != null ? BigInt(input.cost) : undefined,
        active: input.active ?? undefined,
      },
    });
    await this.audit.record({
      actorId, action: 'reward.update', entity: 'reward', entityId: id,
      before: { cost: existing.costCents.toString(), active: existing.active },
      after: { cost: updated.costCents.toString(), active: updated.active },
    });
    return { id: updated.id, name: updated.name, cost: updated.costCents.toString(), active: updated.active };
  }

  /**
   * Redeem points for a reward. Balance check + debit happen atomically;
   * every redemption writes a REDEEM ledger row with a voucher code.
   */
  async redeem(userId: string, rewardId: string) {
    return this.prisma.$transaction(async (tx) => {
      const reward = await tx.reward.findUnique({ where: { id: rewardId } });
      if (!reward || !reward.active) throw new NotFoundException('Reward not available');
      const profile = await tx.customerProfile.findUnique({ where: { userId } });
      if (!profile) throw new BadRequestException('No loyalty account yet — earn points first');
      const account = await tx.loyaltyAccount.findUnique({ where: { customerId: profile.id } });
      if (!account || account.balanceCents < reward.costCents) {
        throw new BadRequestException('Insufficient points for this reward');
      }
      const voucher = `RWD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const txn = await tx.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          type: 'REDEEM',
          deltaCents: -reward.costCents,
          reason: `Redeemed: ${reward.name} · voucher ${voucher}`,
          refType: 'REWARD',
          refId: reward.id,
        },
      });
      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: { balanceCents: { decrement: reward.costCents } },
      });
      await this.audit.record({
        actorId: userId, action: 'reward.redeem', entity: 'loyaltyTransaction', entityId: txn.id,
        after: { rewardId, voucher, cost: reward.costCents.toString() },
      });
      await this.analytics?.track('POINTS_REDEEMED', {
        userId,
        payload: { rewardId, points: reward.costCents.toString(), voucher },
      });
      return { voucher, reward: reward.name, cost: reward.costCents.toString() };
    });
  }

  // --- admin: rules & tiers ------------------------------------------------------------

  async listRules() {
    await this.ensureSeeded(this.prisma);
    const rules = await this.prisma.loyaltyRule.findMany({ orderBy: { event: 'asc' } });
    return rules.map((r) => ({ event: r.event, points: r.points, active: r.active }));
  }

  async updateRule(actorId: string, input: { event: string; points: number; active?: boolean }) {
    const rule = await this.prisma.loyaltyRule.upsert({
      where: { event: input.event },
      update: { points: input.points, active: input.active ?? true },
      create: { event: input.event, points: input.points, active: input.active ?? true },
    });
    await this.audit.record({
      actorId, action: 'loyaltyRule.update', entity: 'loyaltyRule', entityId: rule.id, after: input as any,
    });
    return { event: rule.event, points: rule.points, active: rule.active };
  }

  async listTiers() {
    await this.ensureSeeded(this.prisma);
    const tiers = await this.prisma.loyaltyTier.findMany({ orderBy: { thresholdCents: 'asc' } });
    return this.mapTiers(tiers);
  }

  async updateTier(actorId: string, id: string, threshold: number) {
    const existing = await this.prisma.loyaltyTier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tier not found');
    const updated = await this.prisma.loyaltyTier.update({
      where: { id },
      data: { thresholdCents: BigInt(threshold) },
    });
    await this.audit.record({
      actorId, action: 'loyaltyTier.update', entity: 'loyaltyTier', entityId: id,
      before: { threshold: existing.thresholdCents.toString() },
      after: { threshold: updated.thresholdCents.toString() },
    });
    return { id: updated.id, name: updated.name, threshold: updated.thresholdCents.toString() };
  }

  private mapTiers(tiers: Array<{ id: string; name: string; thresholdCents: bigint }>) {
    return tiers.map((t) => ({ id: t.id, name: t.name, threshold: t.thresholdCents.toString() }));
  }
}
