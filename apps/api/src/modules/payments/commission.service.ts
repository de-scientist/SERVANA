import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService } from '../prisma/prisma.service';

export interface CommissionResult {
  rateBasisPoints: number;
  fixedCents: bigint;
  commissionCents: bigint;
  ruleSnapshot: Array<{ id: string; scope: string; type: string; value: bigint; priority: number }>;
}

const STANDARD_RULE_ID = 'standard';
const DEFAULT_COMMISSION_BPS = 1000; // 10%

/**
 * Configurable commission engine.
 *
 * Rules carry a `scope`:
 *   - "standard"                      applies to every payment
 *   - "category:<categoryId>"         overrides for a category
 *   - "provider:<providerId>"         overrides for a provider
 *   - "tier:<tierId>"                 overrides for a loyalty tier
 *
 * For a given payment we take the highest-priority PERCENTAGE rule (so a
 * provider/category override beats the standard rate) and sum all applicable
 * FIXED rules. The exact calculation is persisted on every transaction via the
 * Commission row (ruleSnapshot), so reports are auditable and never recomputed.
 */
@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(private readonly prisma: PrismaService) {
    void this.seedStandardRule().catch((err) => this.logger.warn(`commission seed failed: ${err}`));
  }

  private async seedStandardRule(): Promise<void> {
    await this.prisma.commissionRule.upsert({
      where: { id: STANDARD_RULE_ID },
      update: {},
      create: {
        id: STANDARD_RULE_ID,
        scope: 'standard',
        type: 'PERCENTAGE',
        value: BigInt(DEFAULT_COMMISSION_BPS),
        priority: 0,
        validFrom: new Date(),
      },
    });
  }

  async compute(
    grossCents: bigint,
    opts: { providerId?: string | null; categoryId?: string | null },
  ): Promise<CommissionResult> {
    const now = new Date();
    const scopes = ['standard'];
    if (opts.categoryId) scopes.push(`category:${opts.categoryId}`);
    if (opts.providerId) scopes.push(`provider:${opts.providerId}`);

    const rules = await this.prisma.commissionRule.findMany({
      where: {
        scope: { in: scopes },
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
    });

    const snapshot = rules.map((r) => ({
      id: r.id,
      scope: r.scope,
      type: r.type,
      value: r.value,
      priority: r.priority,
    }));

    const percentageRules = rules
      .filter((r) => r.type === 'PERCENTAGE')
      .sort((a, b) => b.priority - a.priority);
    const fixedRules = rules.filter((r) => r.type === 'FIXED');

    const rateBasisPoints = percentageRules.length ? Number(percentageRules[0].value) : 0;
    const fixedCents = fixedRules.reduce((sum, r) => sum + r.value, 0n);

    let commission = (grossCents * BigInt(rateBasisPoints)) / 10000n + fixedCents;
    if (commission < 0n) commission = 0n;
    if (commission > grossCents) commission = grossCents;

    return { rateBasisPoints, fixedCents, commissionCents: commission, ruleSnapshot: snapshot };
  }
}
