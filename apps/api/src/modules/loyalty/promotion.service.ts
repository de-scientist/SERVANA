import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toMinorUnits } from '../../common/money/money';
import { CreatePromotionInput, UpdatePromotionInput } from './dto/loyalty.schema';

export interface OrderLineScope {
  productId: string;
  categoryId: string | null;
  providerId: string | null;
}

const SCOPES = ['GLOBAL', 'PRODUCT', 'CATEGORY', 'PROVIDER', 'SERVICE'] as const;

/**
 * Admin-configured promotions with deterministic validation:
 * active window, minimum order, scope match on EVERY line (no mixed-cart
 * abuse), global + per-customer usage caps. PERCENTAGE values are basis
 * points (1000 = 10%); FIXED values are major units at the API boundary and
 * minor units in storage.
 */
@Injectable()
export class PromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- admin ----------------------------------------------------------------------

  async create(actorId: string, input: CreatePromotionInput) {
    if (!SCOPES.includes(input.scope as any)) throw new BadRequestException('Invalid scope');
    if (input.scope !== 'GLOBAL' && !input.scopeId) {
      throw new BadRequestException('Scoped promotions require a scopeId');
    }
    if (input.kind === 'PERCENTAGE' && (input.value <= 0 || input.value > 10000)) {
      throw new BadRequestException('Percentage value must be 1–10000 basis points');
    }
    const now = new Date();
    try {
      const promo = await this.prisma.promotion.create({
        data: {
          code: input.code.trim().toUpperCase(),
          name: input.name,
          description: input.description ?? null,
          kind: input.kind,
          value: input.kind === 'FIXED' ? toMinorUnits(input.value) : BigInt(Math.round(input.value)),
          validFrom: input.validFrom ? new Date(input.validFrom) : now,
          validTo: input.validTo ? new Date(input.validTo) : null,
          scope: input.scope,
          scopeId: input.scopeId ?? null,
          minOrderCents: toMinorUnits(input.minOrder ?? 0),
          maxDiscountCents: input.maxDiscount != null ? toMinorUnits(input.maxDiscount) : null,
          usageLimit: input.usageLimit ?? null,
          usedCount: 0,
          perCustomerLimit: input.perCustomerLimit ?? 1,
          active: input.active ?? true,
        },
      });
      await this.audit.record({
        actorId, action: 'promotion.create', entity: 'promotion', entityId: promo.id, after: input as any,
      });
      return this.mapPromo(promo);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Promotion code already exists');
      }
      throw err;
    }
  }

  async list() {
    const promos = await this.prisma.promotion.findMany({ orderBy: { code: 'asc' } });
    return promos.map((p) => this.mapPromo(p));
  }

  async update(actorId: string, id: string, input: UpdatePromotionInput) {
    const existing = await this.prisma.promotion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Promotion not found');
    const updated = await this.prisma.promotion.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        description: input.description ?? undefined,
        validTo: input.validTo === null ? null : input.validTo ? new Date(input.validTo) : undefined,
        maxDiscountCents: input.maxDiscount === null ? null : input.maxDiscount != null ? toMinorUnits(input.maxDiscount) : undefined,
        usageLimit: input.usageLimit ?? undefined,
        perCustomerLimit: input.perCustomerLimit ?? undefined,
        active: input.active ?? undefined,
      },
    });
    await this.audit.record({
      actorId, action: 'promotion.update', entity: 'promotion', entityId: id,
      before: { active: existing.active }, after: { active: updated.active },
    });
    return this.mapPromo(updated);
  }

  // --- validation (orders) ---------------------------------------------------------------

  /**
   * Validate a code against an order draft. Returns the discount in minor
   * units. Throws with a customer-readable reason otherwise.
   */
  async validateForOrder(
    code: string,
    ctx: { customerId: string; subtotalCents: bigint; lines: OrderLineScope[] },
  ): Promise<{ promotion: any; discountCents: bigint }> {
    const promo = await this.prisma.promotion.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!promo || !promo.active) throw new NotFoundException('Promotion code not recognized');
    const now = new Date();
    if (now < promo.validFrom || (promo.validTo && now > promo.validTo)) {
      throw new BadRequestException('This promotion is not currently valid');
    }
    if (ctx.subtotalCents < promo.minOrderCents) {
      throw new BadRequestException('This promotion requires a larger order total');
    }
    if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
      throw new BadRequestException('This promotion has reached its usage limit');
    }
    const customerUses = await this.prisma.promotionRedemption.count({
      where: { promoId: promo.id, usedBy: ctx.customerId },
    });
    if (customerUses >= promo.perCustomerLimit) {
      throw new BadRequestException('You have already used this promotion');
    }

    this.assertScope(promo, ctx.lines);

    if (promo.kind === 'FREE_SHIP') {
      throw new BadRequestException('This promotion cannot be applied to product orders');
    }
    let discount: bigint;
    if (promo.kind === 'PERCENTAGE') {
      discount = (ctx.subtotalCents * promo.value) / 10000n;
    } else {
      discount = promo.value;
    }
    if (promo.maxDiscountCents != null && discount > promo.maxDiscountCents) {
      discount = promo.maxDiscountCents;
    }
    if (discount > ctx.subtotalCents) discount = ctx.subtotalCents;
    if (discount <= 0n) throw new BadRequestException('This promotion gives no discount on this order');
    return { promotion: promo, discountCents: discount };
  }

  private assertScope(promo: { scope: string; scopeId: string | null }, lines: OrderLineScope[]) {
    if (promo.scope === 'GLOBAL') return;
    if (promo.scope === 'SERVICE') {
      throw new BadRequestException('This promotion applies to service bookings, not product orders');
    }
    if (!promo.scopeId) throw new BadRequestException('This promotion is not configured for orders');
    const matches = (l: OrderLineScope) => {
      if (promo.scope === 'PRODUCT') return l.productId === promo.scopeId;
      if (promo.scope === 'CATEGORY') return l.categoryId === promo.scopeId;
      if (promo.scope === 'PROVIDER') return l.providerId === promo.scopeId;
      return false;
    };
    if (lines.length === 0 || !lines.every(matches)) {
      throw new BadRequestException('This promotion does not apply to every item in the order');
    }
  }

  /** Record redemption + bump usage inside the caller's checkout transaction. */
  async recordRedemption(
    tx: any,
    input: { promoId: string; orderId: string; usedBy: string; discountCents: bigint },
  ) {
    await tx.promotionRedemption.create({
      data: {
        promoId: input.promoId,
        orderId: input.orderId,
        usedBy: input.usedBy,
        discountCents: input.discountCents,
      },
    });
    await tx.promotion.update({
      where: { id: input.promoId },
      data: { usedCount: { increment: 1 } },
    });
  }

  // --- helpers ------------------------------------------------------------------------------

  private mapPromo(p: any) {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      kind: p.kind,
      // FIXED stored as minor units; present as major for readability.
      value: p.kind === 'FIXED' ? Number(p.value) / 100 : p.value.toString(),
      valueCents: p.value.toString(),
      validFrom: p.validFrom,
      validTo: p.validTo,
      scope: p.scope,
      scopeId: p.scopeId,
      minOrderCents: p.minOrderCents.toString(),
      maxDiscountCents: p.maxDiscountCents?.toString() ?? null,
      usageLimit: p.usageLimit,
      usedCount: p.usedCount,
      perCustomerLimit: p.perCustomerLimit,
      active: p.active,
    };
  }
}
