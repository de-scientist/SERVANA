import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OrderService, ORDER_TRANSITIONS } from './order.service';

function makePrisma() {
  return {
    cart: { findUnique: jest.fn() },
    cartItem: { deleteMany: jest.fn() },
    inventory: { findFirst: jest.fn(), update: jest.fn() },
    order: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    payment: { update: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn({
      inventory: { findFirst: jest.fn(), update: jest.fn() },
      order: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
      cartItem: { deleteMany: jest.fn() },
      payment: { update: jest.fn() },
    })),
  } as any;
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) } as any;
}

function makePayments() {
  return {
    initiateForOrder: jest.fn().mockResolvedValue({ id: 'pay1', status: 'PENDING' }),
    refund: jest.fn().mockResolvedValue({ id: 'pay1', status: 'REFUNDED' }),
    retryOrderPayment: jest.fn(),
  } as any;
}

function makeProducts() {
  return {
    effectiveUnitCents: (
      product: { priceCents: bigint; saleCents: bigint | null },
      delta = 0n,
    ) => {
      const base = product.saleCents ?? product.priceCents;
      const total = base + delta;
      return total >= 0n ? total : 0n;
    },
  } as any;
}

function makePromotions() {
  return {
    validateForOrder: jest.fn(),
    recordRedemption: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeNotifications() {
  return { notify: jest.fn().mockResolvedValue([]) } as any;
}

function service(prisma?: any, payments?: any) {
  return new OrderService(prisma ?? makePrisma(), makeAudit(), payments ?? makePayments(), makeProducts(), makePromotions(), makeNotifications());
}

function cartWith(itemOverrides: Record<string, any> = {}) {
  return {
    id: 'cart1',
    items: [
      {
        id: 'ci1',
        productId: 'prod1',
        variantId: null,
        qty: 2,
        product: {
          id: 'prod1',
          name: 'Hair Oil',
          status: 'ACTIVE',
          priceCents: 150000n,
          saleCents: null,
          currency: 'KES',
          variants: [],
          inventory: [{ quantity: 10, reserved: 0 }],
        },
        ...itemOverrides,
      },
    ],
  };
}

describe('OrderService', () => {
  describe('state machine', () => {
    it('exposes the full fulfilment lifecycle', () => {
      expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual(
        ['PENDING', 'PAID', 'PROCESSING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].sort(),
      );
      expect(ORDER_TRANSITIONS.PENDING).toEqual(['CANCELLED']);
      expect(ORDER_TRANSITIONS.PAID).toEqual(['PROCESSING', 'CANCELLED', 'REFUNDED']);
      expect(ORDER_TRANSITIONS.DELIVERED).toEqual(['COMPLETED', 'REFUNDED']);
      expect(ORDER_TRANSITIONS.COMPLETED).toEqual([]);
    });

    it('advances PAID → PROCESSING', async () => {
      const prisma = makePrisma();
      prisma.order.findUnique
        .mockResolvedValueOnce({ id: 'o1', status: 'PAID' })
        .mockResolvedValueOnce({
          id: 'o1', status: 'PROCESSING', customerId: 'cust1',
          subtotalCents: 300000n, discountCents: 0n, totalCents: 300000n,
          currency: 'KES', items: [], history: [],
        });
      const svc = service(prisma);

      const result: any = await svc.advance({ sub: 'admin1', role: 'ADMIN' }, 'o1', { to: 'PROCESSING' } as any);
      expect(result.status).toBe('PROCESSING');
    });

    it('rejects skipping steps (PAID → SHIPPED)', async () => {
      const prisma = makePrisma();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'PAID' });
      const svc = service(prisma);

      await expect(
        svc.advance({ sub: 'admin1', role: 'ADMIN' }, 'o1', { to: 'SHIPPED' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('never advances PENDING → PAID manually (webhook-only)', async () => {
      const prisma = makePrisma();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'PENDING' });
      const svc = service(prisma);

      await expect(
        svc.advance({ sub: 'admin1', role: 'ADMIN' }, 'o1', { to: 'PAID' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks non-staff from advancing', async () => {
      const svc = service();
      await expect(
        svc.advance({ sub: 'cust1', role: 'CUSTOMER' }, 'o1', { to: 'PROCESSING' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('checkout (inventory integrity)', () => {
    it('rejects empty carts', async () => {
      const prisma = makePrisma();
      prisma.cart.findUnique.mockResolvedValue({ id: 'cart1', items: [] });
      const svc = service(prisma);

      await expect(svc.checkout({ sub: 'cust1', role: 'CUSTOMER' }, {} as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to oversell (available < qty → 409)', async () => {
      const prisma = makePrisma();
      prisma.cart.findUnique.mockResolvedValue(cartWith());
      prisma.$transaction.mockImplementation(async (fn: any) => fn({
        inventory: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv1', quantity: 1, reserved: 0 }),
          update: jest.fn(),
        },
        order: { create: jest.fn() },
        orderStatusHistory: { create: jest.fn() },
        cartItem: { deleteMany: jest.fn() },
      }));
      const svc = service(prisma);

      // qty 2 requested, only 1 available
      await expect(svc.checkout({ sub: 'cust1', role: 'CUSTOMER' }, {} as any)).rejects.toBeInstanceOf(ConflictException);
    });

    it('reserves stock, snapshots prices, clears cart and initiates payment', async () => {
      const prisma = makePrisma();
      prisma.cart.findUnique.mockResolvedValue(cartWith());
      const txInventoryUpdate = jest.fn();
      const txOrderCreate = jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'o1',
        ...data,
        items: data.items.create.map((i: any, idx: number) => ({ id: `oi${idx}`, ...i })),
      }));
      const txCartClear = jest.fn();
      prisma.$transaction.mockImplementation(async (fn: any) => fn({
        inventory: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv1', quantity: 10, reserved: 0 }),
          update: txInventoryUpdate,
        },
        order: { create: txOrderCreate },
        orderStatusHistory: { create: jest.fn() },
        cartItem: { deleteMany: txCartClear },
      }));
      const payments = makePayments();
      const svc = service(prisma, payments);

      const result: any = await svc.checkout({ sub: 'cust1', role: 'CUSTOMER' }, { method: 'MPESA' } as any);

      // 2 × 150000 = 300000, reservation holds units, cart cleared.
      expect(txOrderCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', totalCents: 300000n }),
        }),
      );
      expect(txInventoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { reserved: { increment: 2 } } }),
      );
      expect(txCartClear).toHaveBeenCalled();
      expect(payments.initiateForOrder).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'cust1' }),
        'o1',
        'MPESA',
      );
      expect(result.payment.status).toBe('PENDING');
    });
  });

  describe('cancel', () => {
    it('customer cancels own PENDING order and releases the reservation', async () => {
      const prisma = makePrisma();
      const order = {
        id: 'o1', customerId: 'cust1', status: 'PENDING',
        items: [{ productId: 'prod1', variantId: null, qty: 2 }],
        payment: { id: 'pay1', status: 'PENDING' },
      };
      prisma.order.findUnique.mockResolvedValue(order);
      const txInventoryUpdate = jest.fn();
      prisma.$transaction.mockImplementation(async (fn: any) => fn({
        payment: { update: jest.fn() },
        inventory: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv1', quantity: 10, reserved: 2 }),
          update: txInventoryUpdate,
        },
        order: { update: jest.fn() },
        orderStatusHistory: { create: jest.fn() },
      }));
      // getMine after cancel
      prisma.order.findUnique.mockResolvedValueOnce(order).mockResolvedValue({
        ...order, status: 'CANCELLED', subtotalCents: 0n, discountCents: 0n, totalCents: 0n, currency: 'KES', history: [],
      });
      const svc = service(prisma);

      const result: any = await svc.cancel({ sub: 'cust1', role: 'CUSTOMER' }, 'o1', {});
      expect(result.status).toBe('CANCELLED');
      expect(txInventoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { reserved: 0 } }),
      );
    });

    it('customer cannot cancel a PAID order (refund path instead)', async () => {
      const prisma = makePrisma();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1', customerId: 'cust1', status: 'PAID', items: [], payment: { id: 'pay1', status: 'SUCCESSFUL' },
      });
      const svc = service(prisma);

      await expect(svc.cancel({ sub: 'cust1', role: 'CUSTOMER' }, 'o1', {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects cancel of terminal orders', async () => {
      const prisma = makePrisma();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1', customerId: 'cust1', status: 'COMPLETED', items: [], payment: null,
      });
      const svc = service(prisma);

      await expect(
        svc.cancel({ sub: 'admin1', role: 'ADMIN' }, 'o1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('refund', () => {
    it('delegates paid-money returns to payments (audited ledger reversal)', async () => {
      const prisma = makePrisma();
      prisma.order.findUnique
        .mockResolvedValueOnce({
          id: 'o1', customerId: 'cust1', status: 'DELIVERED',
          payment: { id: 'pay1', status: 'SUCCESSFUL' },
        })
        .mockResolvedValueOnce({
          id: 'o1', customerId: 'cust1', status: 'REFUNDED',
          subtotalCents: 300000n, discountCents: 0n, totalCents: 300000n,
          currency: 'KES', items: [], history: [],
        });
      const payments = makePayments();
      const svc = service(prisma, payments);

      const result: any = await svc.refund({ sub: 'admin1', role: 'ADMIN' }, 'o1', 'Damaged in transit');
      expect(result.status).toBe('REFUNDED');
      expect(payments.refund).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'admin1' }),
        'pay1',
        'Damaged in transit',
      );
    });

    it('blocks non-admins from refunding', async () => {
      const svc = service();
      await expect(svc.refund({ sub: 'cust1', role: 'CUSTOMER' }, 'o1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
