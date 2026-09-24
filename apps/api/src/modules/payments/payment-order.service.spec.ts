import { BadRequestException } from '@nestjs/common';
import { PaymentService } from './payment.service';

function makeGateway() {
  return {
    get: jest.fn().mockReturnValue({
      id: 'stub',
      initiate: jest.fn().mockResolvedValue({ providerRef: 'stub_ref_1', status: 'PENDING' }),
      refund: jest.fn().mockResolvedValue({}),
    }),
    getById: jest.fn().mockReturnValue({
      id: 'stub',
      initiate: jest.fn().mockResolvedValue({ providerRef: 'stub_ref_1', status: 'PENDING' }),
      refund: jest.fn().mockResolvedValue({}),
      verifyWebhook: jest.fn().mockResolvedValue(true),
    }),
  } as any;
}

function makeCommission() {
  return {
    compute: jest.fn().mockResolvedValue({
      rateBasisPoints: 1000,
      fixedCents: 0n,
      commissionCents: 30000n,
      ruleSnapshot: [{ id: 'standard', scope: 'standard', type: 'PERCENTAGE', value: 1000n, priority: 0 }],
    }),
  } as any;
}

function makeLoyalty() {
  return { earnFromPayment: jest.fn().mockResolvedValue({ transaction: { id: 'lt1' } }) } as any;
}

function makeNotifications() {
  return { notify: jest.fn().mockResolvedValue([]) } as any;
}

function orderRow() {
  return {
    id: 'ord1',
    customerId: 'cust1',
    status: 'PENDING',
    totalCents: 300000n,
    currency: 'KES',
    items: [
      { productId: 'prod1', variantId: null, qty: 2, product: { providerId: 'prov1' } },
    ],
  };
}

describe('PaymentService (orders)', () => {
  describe('initiateForOrder', () => {
    it('creates a PENDING payment for a PENDING order', async () => {
      const prisma = {
        order: { findUnique: jest.fn().mockResolvedValue(orderRow()) },
        payment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'pay1' }) },
        booking: { findUnique: jest.fn(), update: jest.fn() },
      } as any;
      prisma.payment.create.mockResolvedValue({ id: 'pay1' });
      const svc = new PaymentService(prisma, makeGateway(), makeCommission(), makeLoyalty(), makeNotifications());
      (svc as any).mapPayment = jest.fn().mockReturnValue({ id: 'pay1', status: 'PENDING' });

      const result: any = await svc.initiateForOrder({ sub: 'cust1', role: 'CUSTOMER' }, 'ord1', 'MPESA');

      expect(result.status).toBe('PENDING');
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orderId: 'ord1', grossCents: 300000n, status: 'PENDING' }),
        }),
      );
    });

    it('is idempotent while unpaid', async () => {
      const prisma = {
        order: { findUnique: jest.fn().mockResolvedValue(orderRow()) },
        payment: {
          findUnique: jest.fn().mockResolvedValue({ id: 'pay1', status: 'PENDING', grossCents: 300000n }),
          create: jest.fn(),
        },
      } as any;
      const svc = new PaymentService(prisma, makeGateway(), makeCommission(), makeLoyalty(), makeNotifications());
      (svc as any).mapPayment = jest.fn().mockReturnValue({ id: 'pay1', status: 'PENDING' });

      await svc.initiateForOrder({ sub: 'cust1', role: 'CUSTOMER' }, 'ord1', 'MPESA');
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('rejects already-paid orders', async () => {
      const prisma = {
        order: { findUnique: jest.fn().mockResolvedValue({ ...orderRow(), status: 'PAID' }) },
        payment: { findUnique: jest.fn() },
      } as any;
      const svc = new PaymentService(prisma, makeGateway(), makeCommission(), makeLoyalty(), makeNotifications());

      await expect(
        svc.initiateForOrder({ sub: 'cust1', role: 'CUSTOMER' }, 'ord1', 'MPESA'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('webhook capture (orders)', () => {
    function txWith(orderOverrides: Record<string, any> = {}) {
      const tx: any = {
        payment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pay1', orderId: 'ord1', bookingId: null, customerId: 'cust1',
            status: 'PENDING', grossCents: 300000n, currency: 'KES',
            expiresAt: new Date(Date.now() + 60000),
          }),
          update: jest.fn(),
        },
        order: {
          findUnique: jest.fn().mockResolvedValue({ ...orderRow(), ...orderOverrides }),
          update: jest.fn(),
        },
        orderStatusHistory: { create: jest.fn() },
        paymentTransaction: { create: jest.fn() },
        commission: { upsert: jest.fn() },
        providerEarning: { upsert: jest.fn().mockResolvedValue({ id: 'e1' }) },
        payoutMethod: { findFirst: jest.fn().mockResolvedValue({ id: 'pm1' }), create: jest.fn() },
        payout: { upsert: jest.fn().mockResolvedValue({ id: 'po1' }) },
        payoutItem: { upsert: jest.fn() },
        inventory: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv1', quantity: 10, reserved: 2 }),
          update: jest.fn(),
        },
        loyaltyTier: { upsert: jest.fn() },
        loyaltyAccount: {
          upsert: jest.fn().mockResolvedValue({ id: 'la1' }),
          update: jest.fn(),
          findFirst: jest.fn(),
        },
        loyaltyTransaction: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
        booking: { update: jest.fn(), findUnique: jest.fn() },
        bookingStatusHistory: { create: jest.fn() },
      };
      return tx;
    }

    it('finalizes stock, books earning + payout, and marks PAID — never touching bookings', async () => {
      const tx = txWith();
      const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as any;
      const svc = new PaymentService(prisma, makeGateway(), makeCommission(), makeLoyalty(), makeNotifications());

      const result: any = await svc.handleProviderEvent('stub', {
        providerRef: 'stub_ref_1', status: 'SUCCESSFUL', amount: '300000', currency: 'KES',
      });

      expect(result.captured).toBe(true);
      // 300000 gross − 30000 commission = 270000 seller net.
      expect(tx.providerEarning.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderId: 'ord1' },
          create: expect.objectContaining({ providerId: 'prov1', netCents: 270000n, status: 'AVAILABLE' }),
        }),
      );
      // Stock finalized exactly once: 10 − 2 sold, reservation released.
      expect(tx.inventory.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { quantity: 8, reserved: 0 } }),
      );
      expect(tx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PAID' } }),
      );
      expect(tx.payoutItem.upsert).toHaveBeenCalled();
      expect(tx.booking.update).not.toHaveBeenCalled();
    });

    it('keeps platform-owned orders ledger-intact (full margin as commission, no earning)', async () => {
      const tx = txWith();
      tx.order.findUnique.mockResolvedValue({
        ...orderRow(),
        items: [{ productId: 'prod1', variantId: null, qty: 2, product: { providerId: null } }],
      });
      const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as any;
      const svc = new PaymentService(prisma, makeGateway(), makeCommission(), makeLoyalty(), makeNotifications());

      const result: any = await svc.handleProviderEvent('stub', {
        providerRef: 'stub_ref_1', status: 'SUCCESSFUL', amount: '300000', currency: 'KES',
      });

      expect(result.captured).toBe(true);
      expect(tx.commission.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ commissionCents: 300000n, rateBasisPoints: 10000 }),
        }),
      );
      expect(tx.providerEarning.upsert).not.toHaveBeenCalled();
      expect(tx.payout.upsert).not.toHaveBeenCalled();
    });
  });

  describe('refund (orders)', () => {
    it('reverses earning, restocks sold units, and flips the order', async () => {
      const tx: any = {
        payment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'pay1', orderId: 'ord1', bookingId: null, customerId: 'cust1',
            status: 'SUCCESSFUL', grossCents: 300000n, currency: 'KES',
          }),
          update: jest.fn(),
        },
        refund: { create: jest.fn() },
        paymentTransaction: { create: jest.fn() },
        providerEarning: { updateMany: jest.fn() },
        loyaltyTransaction: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
        loyaltyAccount: { findFirst: jest.fn(), update: jest.fn() },
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ord1', status: 'DELIVERED',
            items: [{ productId: 'prod1', variantId: null, qty: 2 }],
          }),
          update: jest.fn(),
        },
        orderStatusHistory: { create: jest.fn() },
        inventory: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv1', quantity: 8, reserved: 0 }),
          update: jest.fn(),
        },
        booking: { findUnique: jest.fn(), update: jest.fn() },
        bookingStatusHistory: { create: jest.fn() },
      };
      const prisma = {
        payment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'pay1', orderId: 'ord1', bookingId: null, customerId: 'cust1',
            status: 'SUCCESSFUL', grossCents: 300000n, currency: 'KES', provider: 'stub', providerRef: 'r1',
          }),
        },
        $transaction: jest.fn(async (fn: any) => fn(tx)),
      } as any;
      const svc = new PaymentService(prisma, makeGateway(), makeCommission(), makeLoyalty(), makeNotifications());
      (svc as any).mapPayment = jest.fn().mockReturnValue({ id: 'pay1', status: 'REFUNDED' });

      await svc.refund({ sub: 'admin1', role: 'ADMIN' }, 'pay1', 'Damaged');

      expect(tx.providerEarning.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orderId: 'ord1' } }),
      );
      expect(tx.inventory.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { quantity: { increment: 2 } } }),
      );
      expect(tx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REFUNDED' } }),
      );
    });
  });
});
