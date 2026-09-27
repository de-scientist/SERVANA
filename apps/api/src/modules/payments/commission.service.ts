import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CommissionResult {
  rateBasisPoints: number;
  fixedCents: bigint;
  commissionCents: bigint;
  ruleSnapshot: Array<{ id: string; scope: string; type: string; value: bigint; priority: number }>;
}

export interface CreateCommissionRuleInput {
  scope: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  priority?: number;
  validFrom?: Date;
  validTo?: Date | null;
}

export interface UpdateCommissionRuleInput {
  type?: 'PERCENTAGE' | 'FIXED';
  value?: number;
  priority?: number;
  validTo?: Date | null;
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

  // --- Rule management (admin) ---------------------------------------------

  async listRules(): Promise<Array<{
    id: string;
    scope: string;
    type: string;
    value: string;
    priority: number;
    validFrom: Date;
    validTo: Date | null;
  }>> {
    const rules = await this.prisma.commissionRule.findMany({ orderBy: [{ scope: 'asc' }, { priority: 'desc' }] });
    return rules.map((r) => ({
      id: r.id,
      scope: r.scope,
      type: r.type,
      value: r.value.toString(),
      priority: r.priority,
      validFrom: r.validFrom,
      validTo: r.validTo,
    }));
  }

  async getRule(id: string) {
    const rule = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException(`Commission rule "${id}" not found`);
    return {
      ...rule,
      value: rule.value.toString(),
    };
  }

  async createRule(input: CreateCommissionRuleInput) {
    const id = `${input.scope}_${Date.now().toString(36)}`;

    if (input.type === 'PERCENTAGE' && (input.value < 0 || input.value > 10000)) {
      throw new BadRequestException('Percentage value must be between 0 and 10000 basis points');
    }
    if (input.type === 'FIXED' && input.value < 0) {
      throw new BadRequestException('Fixed value must be non-negative');
    }

    const existing = await this.prisma.commissionRule.findFirst({ where: { scope: input.scope } });
    if (existing && input.scope === 'standard') {
      throw new BadRequestException('A standard rule already exists. Update it instead.');
    }

    const rule = await this.prisma.commissionRule.create({
      data: {
        id,
        scope: input.scope,
        type: input.type,
        value: BigInt(input.value),
        priority: input.priority ?? 0,
        validFrom: input.validFrom ?? new Date(),
        validTo: input.validTo ?? null,
      },
    });

    return { ...rule, value: rule.value.toString() };
  }

  async updateRule(id: string, input: UpdateCommissionRuleInput) {
    if (id === STANDARD_RULE_ID) {
      throw new BadRequestException('Cannot modify the standard rule. Create a scope-specific override instead.');
    }

    const existing = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Commission rule "${id}" not found`);

    const data: Prisma.CommissionRuleUpdateInput = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.value !== undefined) {
      if (input.type === 'PERCENTAGE' || existing.type === 'PERCENTAGE') {
        const pct = input.value ?? Number(existing.value);
        if (pct < 0 || pct > 10000) {
          throw new BadRequestException('Percentage value must be between 0 and 10000 basis points');
        }
      }
      if (input.value < 0) {
        throw new BadRequestException('Value must be non-negative');
      }
      data.value = BigInt(input.value);
    }
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.validTo !== undefined) data.validTo = input.validTo;

    const rule = await this.prisma.commissionRule.update({ where: { id }, data });
    return { ...rule, value: rule.value.toString() };
  }

  async deleteRule(id: string) {
    if (id === STANDARD_RULE_ID) {
      throw new BadRequestException('Cannot delete the standard rule');
    }
    const existing = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Commission rule "${id}" not found`);
    await this.prisma.commissionRule.delete({ where: { id } });
    return { deleted: true };
  }
}
