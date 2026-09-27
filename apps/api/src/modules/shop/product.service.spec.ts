import { BadRequestException } from '@nestjs/common';
import { ProductService } from './product.service';

function makePrisma(opts: {
  products?: any[];
  product?: any;
  links?: any[];
  category?: any;
  seller?: any;
} = {}) {
  return {
    product: {
      findMany: jest.fn().mockResolvedValue(opts.products ?? []),
      findUnique: jest.fn().mockResolvedValue(opts.product ?? null),
      count: jest.fn().mockResolvedValue((opts.products ?? []).length),
      create: jest.fn(),
      update: jest.fn(),
    },
    category: {
      findUnique: jest.fn().mockResolvedValue(opts.category ?? null),
    },
    service: {
      findUnique: jest.fn(),
    },
    providerService: {
      findUnique: jest.fn(),
    },
    serviceProductLink: {
      findMany: jest.fn().mockResolvedValue(opts.links ?? []),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    inventory: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    productVariant: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => fn({
      product: { create: jest.fn() },
      productVariant: { create: jest.fn() },
      inventory: { create: jest.fn() },
    })),
  } as any;
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) } as any;
}

function svc(prisma?: any) {
  return new ProductService(prisma ?? makePrisma(), makeAudit());
}

function stockedProduct(id: string, name = 'Hair Oil', categoryId = 'cat-hair') {
  return {
    id,
    name,
    brand: 'Servana',
    sku: `SKU-${id}`,
    categoryId,
    category: { id: categoryId, name: 'Hair', slug: 'hair' },
    priceCents: 150000n,
    saleCents: 120000n,
    currency: 'KES',
    status: 'ACTIVE',
    providerId: 'prov1',
    images: [],
    variants: [],
    inventory: [{ variantId: null, quantity: 10, reserved: 2 }],
  };
}

describe('ProductService', () => {
  describe('pricing', () => {
    it('prefers the sale price and applies variant deltas', () => {
      const s = svc();
      expect(s.effectiveUnitCents({ priceCents: 150000n, saleCents: 120000n })).toBe(120000n);
      expect(s.effectiveUnitCents({ priceCents: 150000n, saleCents: null })).toBe(150000n);
      expect(s.effectiveUnitCents({ priceCents: 150000n, saleCents: 120000n }, 5000n)).toBe(125000n);
      expect(s.effectiveUnitCents({ priceCents: 1000n, saleCents: null }, -5000n)).toBe(0n);
    });

    it('rejects sale prices at or above the regular price', async () => {
      const prisma = makePrisma({ product: stockedProduct('p1') });
      const s = svc(prisma);
      await expect(s.update({ sub: 'admin1', role: 'ADMIN' }, 'p1', { salePrice: 2000 } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('cross-sell', () => {
    it('requires a service reference', async () => {
      const s = svc();
      await expect(s.crossSell({ limit: 8 } as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ranks curated links before category fallback and skips unstocked', async () => {
      const curated = stockedProduct('cur1', 'Aftercare Oil');
      const fallback = stockedProduct('fb1', 'Shampoo');
      const unstocked = { ...stockedProduct('out1', 'Gone Serum'), inventory: [{ variantId: null, quantity: 0, reserved: 0 }] };
      const prisma = makePrisma({
        links: [
          { product: curated, reason: 'Pairs with braids', sortOrder: 0 },
          { product: unstocked, reason: null, sortOrder: 1 },
        ],
        products: [fallback],
      });
      prisma.service.findUnique.mockResolvedValue({ id: 'svc1', categoryId: 'cat-hair' });
      const s = svc(prisma);

      const result = await s.crossSell({ serviceId: 'svc1', limit: 8 } as any);

      expect(result.data[0].id).toBe('cur1');
      expect(result.data[0].source).toBe('curated');
      expect(result.data.map((p: any) => p.id)).toContain('fb1');
      // Unstocked curated product is filtered, never recommended.
      expect(result.data.map((p: any) => p.id)).not.toContain('out1');
      expect(result.data[result.data.length - 1].source).toBe('category');
    });

    it('never recommends the same product twice', async () => {
      const p = stockedProduct('p1');
      const other = stockedProduct('p2', 'Other Oil');
      const prisma = makePrisma({ links: [{ product: p, reason: null, sortOrder: 0 }] });
      // Emulate the notIn exclusion the real query applies.
      prisma.product.findMany.mockImplementation(async ({ where }: any) => {
        const excluded: string[] = where?.id?.notIn ?? [];
        return [p, other].filter((x) => !excluded.includes(x.id));
      });
      prisma.service.findUnique.mockResolvedValue({ id: 'svc1', categoryId: 'cat-hair' });
      const s = svc(prisma);

      const result = await s.crossSell({ serviceId: 'svc1', limit: 8 } as any);
      const ids = result.data.map((x: any) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain('p1');
      expect(ids).toContain('p2');
    });
  });
});
