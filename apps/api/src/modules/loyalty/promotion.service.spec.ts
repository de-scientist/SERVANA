import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PromotionService } from './promotion.service';

function promo(overrides: Record<string, any> = {}) {
  return {
    id: 'promo1',
    code: 'SAVE10',
    name: 'Save 10%',
    kind: 'PERCENTAGE',
    value: 1000n,
    validFrom: new Date(Date.now() - 3600_000),
    validTo: null,
    scope: 'GLOBAL',
    scopeId: null,
    minOrderCents: 0n,
    maxDiscountCents: null,
    usageLimit: null,
    usedCount: 0,
    perCustomerLimit: 1,
    active: true,
    ...overrides,
  };
}

function makePrisma(p: any = promo(), redemptions = 0) {
  return {
    promotion: {
      findUnique: jest.fn().mockResolvedValue(p),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    promotionRedemption: {
      count: jest.fn().mockResolvedValue(redemptions),
      create: jest.fn(),
    },
  } as any;
}

function svc(prisma?: any) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return new PromotionService(prisma ?? makePrisma(), audit);
}

const LINES = [{ productId: 'prod1', categoryId: 'cat1', providerId: 'prov1' }];

describe('PromotionService', () => {
  describe('validateForOrder', () => {
    it('computes a percentage discount in basis points', async () => {
      const s = svc();
      const { discountCents } = await s.validateForOrder('SAVE10', {
        customerId: 'cust1', subtotalCents: 300000n, lines: LINES,
      });
      expect(discountCents).toBe(30000n); // 10% of 300000
    });

    it('caps percentage discounts at maxDiscountCents', async () => {
      const s = svc(makePrisma(promo({ maxDiscountCents: 5000n })));
      const { discountCents } = await s.validateForOrder('SAVE10', {
        customerId: 'cust1', subtotalCents: 300000n, lines: LINES,
      });
      expect(discountCents).toBe(5000n);
    });

    it('applies fixed discounts but never below zero', async () => {
      const s = svc(makePrisma(promo({ kind: 'FIXED', value: 500000n })));
      const { discountCents } = await s.validateForOrder('BIG5000', {
        customerId: 'cust1', subtotalCents: 300000n, lines: LINES,
      });
      expect(discountCents).toBe(300000n);
    });

    it('rejects unknown or inactive codes', async () => {
      const s = svc(makePrisma(null));
      await expect(
        s.validateForOrder('NOPE', { customerId: 'c', subtotalCents: 100n, lines: LINES }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects expired promotions', async () => {
      const s = svc(makePrisma(promo({ validTo: new Date(Date.now() - 1000) })));
      await expect(
        s.validateForOrder('SAVE10', { customerId: 'c', subtotalCents: 300000n, lines: LINES }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('enforces minimum order totals', async () => {
      const s = svc(makePrisma(promo({ minOrderCents: 500000n })));
      await expect(
        s.validateForOrder('SAVE10', { customerId: 'c', subtotalCents: 300000n, lines: LINES }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('enforces global usage caps', async () => {
      const s = svc(makePrisma(promo({ usageLimit: 10, usedCount: 10 })));
      await expect(
        s.validateForOrder('SAVE10', { customerId: 'c', subtotalCents: 300000n, lines: LINES }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('enforces per-customer reuse limits', async () => {
      const s = svc(makePrisma(promo(), 1));
      await expect(
        s.validateForOrder('SAVE10', { customerId: 'c', subtotalCents: 300000n, lines: LINES }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires EVERY line to match a PRODUCT scope (no mixed-cart abuse)', async () => {
      const s = svc(makePrisma(promo({ scope: 'PRODUCT', scopeId: 'prod1' })));
      await expect(
        s.validateForOrder('SAVE10', {
          customerId: 'c',
          subtotalCents: 300000n,
          lines: [...LINES, { productId: 'prod2', categoryId: 'cat1', providerId: 'prov1' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const ok = await s.validateForOrder('SAVE10', {
        customerId: 'c', subtotalCents: 300000n, lines: LINES,
      });
      expect(ok.discountCents).toBe(30000n);
    });

    it('routes SERVICE-scoped promos to bookings, not orders', async () => {
      const s = svc(makePrisma(promo({ scope: 'SERVICE', scopeId: 'svc1' })));
      await expect(
        s.validateForOrder('SAVE10', { customerId: 'c', subtotalCents: 300000n, lines: LINES }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
