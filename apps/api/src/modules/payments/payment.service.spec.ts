import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service';

function makePrisma() {
  return {
    booking: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    paymentTransaction: {
      create: jest.fn(),
    },
    commission: {
      upsert: jest.fn(),
    },
    providerEarning: {
      upsert: jest.fn(),
    },
    payoutMethod: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    payout: {
      upsert: jest.fn(),
    },
    loyaltyTier: {
      upsert: jest.fn(),
    },
    loyaltyAccount: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    loyaltyTransaction: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    refund: {
      create: jest.fn(),
    },
    bookingStatusHistory: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => {
      const tx = {
        payment: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        booking: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        paymentTransaction: { create: jest.fn() },
        commission: { upsert: jest.fn() },
        providerEarning: { upsert: jest.fn(), updateMany: jest.fn() },
        payoutMethod: { findFirst: jest.fn(), create: jest.fn() },
        payout: { upsert: jest.fn() },
        loyaltyTier: { upsert: jest.fn() },
        loyaltyAccount: { upsert: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
        loyaltyTransaction: { findFirst: jest.fn(), create: jest.fn() },
        refund: { create: jest.fn() },
        bookingStatusHistory: { create: jest.fn() },
      };
      return fn(tx);
    }),
  } as any;
}

function makeGateway() {
  return {
    get: jest.fn().mockReturnValue({
      id: 'mpesa',
      name: 'M-Pesa',
      methods: ['MPESA'],
      initiate: jest.fn().mockResolvedValue({ providerRef: 'mpesa_ref_123', status: 'PENDING' }),
      refund: jest.fn().mockResolvedValue({ providerRef: 'refund_123', status: 'SUCCESSFUL' }),
      verifyWebhook: jest.fn().mockResolvedValue(true),
    }),
    getById: jest.fn().mockReturnValue({
      id: 'mpesa',
      name: 'M-Pesa',
      methods: ['MPESA'],
      initiate: jest.fn().mockResolvedValue({ providerRef: 'mpesa_ref_123', status: 'PENDING' }),
      refund: jest.fn().mockResolvedValue({ providerRef: 'refund_123', status: 'SUCCESSFUL' }),
      verifyWebhook: jest.fn().mockResolvedValue(true),
    }),
  } as any;
}

function makeCommission() {
  return {
    compute: jest.fn().mockResolvedValue({
      rateBasisPoints: 1000,
      fixedCents: 0n,
      commissionCents: 20000n,
      ruleSnapshot: [{ id: 'standard', scope: 'standard', type: 'PERCENTAGE', value: 1000n, priority: 0 }],
    }),
  } as any;
}

function service(prisma?: any, gateway?: any, commission?: any) {
  return new PaymentService(prisma ?? makePrisma(), gateway ?? makeGateway(), commission ?? makeCommission());
}

describe('PaymentService', () => {
  describe('initiate', () => {
    it('creates a payment for a valid booking', async () => {
      const prisma = makePrisma();
      const gateway = makeGateway();
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        customerId: 'cust1',
        providerId: 'prov1',
        status: 'PENDING',
        priceCents: 200000n,
        currency: 'KES',
        reference: 'SVN-TEST',
        providerService: { provider: { id: 'prov1', status: 'VERIFIED' } },
      });
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({
        id: 'pay1', bookingId: 'b1', status: 'PENDING', method: 'MPESA', provider: 'mpesa',
        providerRef: 'mpesa_ref_123', grossCents: 200000n, commissionCents: 0n, netCents: 200000n,
        currency: 'KES', expiresAt: new Date(), createdAt: new Date(),
      });
      prisma.payment.findUniqueOrThrow.mockResolvedValue({
        id: 'pay1', bookingId: 'b1', status: 'PENDING', method: 'MPESA', provider: 'mpesa',
        providerRef: 'mpesa_ref_123', grossCents: 200000n, commissionCents: 0n, netCents: 200000n,
        currency: 'KES', expiresAt: new Date(), createdAt: new Date(),
      });
      const svc = service(prisma, gateway);

      const result = await svc.initiate({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1' });

      expect(result.status).toBe('PENDING');
      expect(prisma.payment.create).toHaveBeenCalled();
      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'PENDING' }) }),
      );
    });

    it('throws if booking not found', async () => {
      const prisma = makePrisma();
      prisma.booking.findUnique.mockResolvedValue(null);
      const svc = service(prisma);

      await expect(svc.initiate({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws if not the customer booking', async () => {
      const prisma = makePrisma();
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1', customerId: 'other', status: 'PENDING', priceCents: 200000n, currency: 'KES',
        providerService: { provider: { id: 'prov1', status: 'VERIFIED' } },
      });
      const svc = service(prisma);

      await expect(svc.initiate({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws if booking already paid', async () => {
      const prisma = makePrisma();
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1', customerId: 'cust1', status: 'PENDING', priceCents: 200000n, currency: 'KES',
        providerService: { provider: { id: 'prov1', status: 'VERIFIED' } },
      });
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay1', status: 'SUCCESSFUL' });
      const svc = service(prisma);

      await expect(svc.initiate({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reuses existing pending payment (idempotent)', async () => {
      const prisma = makePrisma();
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1', customerId: 'cust1', status: 'AWAITING_PAYMENT', priceCents: 200000n, currency: 'KES',
        providerService: { provider: { id: 'prov1', status: 'VERIFIED' } },
      });
      const existingPayment = {
        id: 'pay_existing', status: 'PENDING', method: 'MPESA', provider: 'mpesa',
        providerRef: 'mpesa_ref_existing', grossCents: 200000n, commissionCents: 0n, netCents: 200000n,
        currency: 'KES', expiresAt: new Date(), createdAt: new Date(),
      };
      prisma.payment.findUnique.mockResolvedValue(existingPayment);
      prisma.payment.findUniqueOrThrow.mockResolvedValue(existingPayment);
      const svc = service(prisma);

      const result = await svc.initiate({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1' });
      expect(result.id).toBe('pay_existing');
    });

    it('throws if booking in non-payable status', async () => {
      const prisma = makePrisma();
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1', customerId: 'cust1', status: 'COMPLETED', priceCents: 200000n, currency: 'KES',
        providerService: { provider: { id: 'prov1', status: 'VERIFIED' } },
      });
      const svc = service(prisma);

      await expect(svc.initiate({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('handleProviderEvent', () => {
    it('processes a successful payment webhook', async () => {
      const prisma = makePrisma();
      const commission = makeCommission();
      const gateway = makeGateway();
      const svc = service(prisma, gateway, commission);

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'pay1', bookingId: 'b1', status: 'PENDING', grossCents: 200000n,
              currency: 'KES', expiresAt: new Date(Date.now() + 60000),
            }),
            update: jest.fn(),
          },
          booking: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'b1', status: 'AWAITING_PAYMENT', providerId: 'prov1',
              providerService: { categoryId: 'cat1' },
            }),
            update: jest.fn(),
          },
          paymentTransaction: { create: jest.fn() },
          commission: { upsert: jest.fn() },
          providerEarning: { upsert: jest.fn() },
          payoutMethod: { findFirst: jest.fn().mockResolvedValue({ id: 'pm_default', type: 'MPESA', isDefault: true }), create: jest.fn() },
          payout: { upsert: jest.fn() },
          loyaltyTier: { upsert: jest.fn() },
          loyaltyAccount: { upsert: jest.fn().mockResolvedValue({ id: 'la1', customerId: 'cust1', balanceCents: 0n }), update: jest.fn() },
          loyaltyTransaction: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
          bookingStatusHistory: { create: jest.fn() },
        };
        return fn(tx);
      });

      const result: any = await svc.handleProviderEvent('mpesa', {
        providerRef: 'mpesa_ref_123',
        status: 'SUCCESSFUL',
        amount: 200000,
        currency: 'KES',
      });

      expect(result.ok).toBe(true);
      expect(result.captured).toBe(true);
    });

    it('ignores unknown provider', async () => {
      const prisma = makePrisma();
      const gateway = makeGateway();
      gateway.getById.mockReturnValue(undefined);
      const svc = service(prisma, gateway);

      const result = await svc.handleProviderEvent('unknown', {
        providerRef: 'ref', status: 'SUCCESSFUL', amount: 100, currency: 'KES',
      });

      expect(result.ok).toBe(false);
    });

    it('ignores unknown payment reference', async () => {
      const prisma = makePrisma();
      const gateway = makeGateway();
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: { findFirst: jest.fn().mockResolvedValue(null) },
        };
        return fn(tx);
      });
      const svc = service(prisma, gateway);

      const result: any = await svc.handleProviderEvent('mpesa', {
        providerRef: 'nonexistent', status: 'SUCCESSFUL', amount: 100, currency: 'KES',
      });

      expect(result.ok).toBe(true);
      expect(result.ignored).toBe(true);
    });

    it('handles duplicate webhook (idempotent)', async () => {
      const prisma = makePrisma();
      const gateway = makeGateway();
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'pay1', status: 'SUCCESSFUL', grossCents: 200000n,
            }),
          },
        };
        return fn(tx);
      });
      const svc = service(prisma, gateway);

      const result: any = await svc.handleProviderEvent('mpesa', {
        providerRef: 'mpesa_ref_123', status: 'SUCCESSFUL', amount: 200000, currency: 'KES',
      });

      expect(result.ok).toBe(true);
      expect(result.duplicate).toBe(true);
    });

    it('handles failed payment', async () => {
      const prisma = makePrisma();
      const gateway = makeGateway();
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'pay1', bookingId: 'b1', status: 'PENDING', grossCents: 200000n,
            }),
            update: jest.fn(),
          },
          booking: { update: jest.fn() },
          bookingStatusHistory: { create: jest.fn() },
        };
        return fn(tx);
      });
      const svc = service(prisma, gateway);

      const result: any = await svc.handleProviderEvent('mpesa', {
        providerRef: 'mpesa_ref_123', status: 'FAILED', amount: 200000, currency: 'KES',
      });

      expect(result.ok).toBe(true);
      expect(result.failed).toBe(true);
    });

    it('rejects payment with wrong amount (never trusts provider)', async () => {
      const prisma = makePrisma();
      const gateway = makeGateway();
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'pay1', bookingId: 'b1', status: 'PENDING', grossCents: 200000n,
              currency: 'KES', expiresAt: new Date(Date.now() + 60000),
            }),
            update: jest.fn(),
          },
          booking: { update: jest.fn() },
          bookingStatusHistory: { create: jest.fn() },
        };
        return fn(tx);
      });
      const svc = service(prisma, gateway);

      const result: any = await svc.handleProviderEvent('mpesa', {
        providerRef: 'mpesa_ref_123', status: 'SUCCESSFUL', amount: 100000, currency: 'KES',
      });

      expect(result.ok).toBe(true);
      expect(result.amountMismatch).toBe(true);
    });

    it('rejects payment with wrong currency', async () => {
      const prisma = makePrisma();
      const gateway = makeGateway();
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'pay1', bookingId: 'b1', status: 'PENDING', grossCents: 200000n,
              currency: 'KES', expiresAt: new Date(Date.now() + 60000),
            }),
            update: jest.fn(),
          },
          booking: { update: jest.fn() },
          bookingStatusHistory: { create: jest.fn() },
        };
        return fn(tx);
      });
      const svc = service(prisma, gateway);

      const result: any = await svc.handleProviderEvent('mpesa', {
        providerRef: 'mpesa_ref_123', status: 'SUCCESSFUL', amount: 200000, currency: 'USD',
      });

      expect(result.ok).toBe(true);
      expect(result.amountMismatch).toBe(true);
    });

    it('cancels payment after expiry', async () => {
      const prisma = makePrisma();
      const gateway = makeGateway();
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'pay1', bookingId: 'b1', status: 'PENDING', grossCents: 200000n,
              currency: 'KES', expiresAt: new Date(Date.now() - 60000), // expired
            }),
            update: jest.fn(),
          },
          booking: {
            findUnique: jest.fn().mockResolvedValue({ id: 'b1', status: 'AWAITING_PAYMENT' }),
            update: jest.fn(),
          },
          bookingStatusHistory: { create: jest.fn() },
        };
        return fn(tx);
      });
      const svc = service(prisma, gateway);

      const result: any = await svc.handleProviderEvent('mpesa', {
        providerRef: 'mpesa_ref_123', status: 'SUCCESSFUL', amount: 200000, currency: 'KES',
      });

      expect(result.ok).toBe(true);
      expect(result.expired).toBe(true);
    });

    it('records ledger entries on success', async () => {
      const prisma = makePrisma();
      const commission = makeCommission();
      const gateway = makeGateway();
      const svc = service(prisma, gateway, commission);

      let capturedTx: any;
      prisma.$transaction.mockImplementation(async (fn: any) => {
        capturedTx = {
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'pay1', bookingId: 'b1', status: 'PENDING', grossCents: 200000n,
              currency: 'KES', expiresAt: new Date(Date.now() + 60000),
            }),
            update: jest.fn(),
          },
          booking: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'b1', status: 'AWAITING_PAYMENT', providerId: 'prov1',
              providerService: { categoryId: 'cat1' },
            }),
            update: jest.fn(),
          },
          paymentTransaction: { create: jest.fn() },
          commission: { upsert: jest.fn() },
          providerEarning: { upsert: jest.fn() },
          payoutMethod: { findFirst: jest.fn().mockResolvedValue({ id: 'pm_default', type: 'MPESA', isDefault: true }), create: jest.fn() },
          payout: { upsert: jest.fn() },
          loyaltyTier: { upsert: jest.fn() },
          loyaltyAccount: { upsert: jest.fn().mockResolvedValue({ id: 'la1', customerId: 'cust1', balanceCents: 0n }), update: jest.fn() },
          loyaltyTransaction: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
          bookingStatusHistory: { create: jest.fn() },
        };
        return fn(capturedTx);
      });

      await svc.handleProviderEvent('mpesa', {
        providerRef: 'mpesa_ref_123', status: 'SUCCESSFUL', amount: 200000, currency: 'KES',
      });

      expect(capturedTx.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'CAPTURE' }) }),
      );
      expect(capturedTx.commission.upsert).toHaveBeenCalled();
      expect(capturedTx.providerEarning.upsert).toHaveBeenCalled();
      expect(capturedTx.payout.upsert).toHaveBeenCalled();
    });

    it('awards loyalty points on success', async () => {
      const prisma = makePrisma();
      const commission = makeCommission();
      const gateway = makeGateway();
      const svc = service(prisma, gateway, commission);

      let capturedTx: any;
      prisma.$transaction.mockImplementation(async (fn: any) => {
        capturedTx = {
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'pay1', bookingId: 'b1', status: 'PENDING', grossCents: 200000n,
              currency: 'KES', expiresAt: new Date(Date.now() + 60000),
            }),
            update: jest.fn(),
          },
          booking: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'b1', status: 'AWAITING_PAYMENT', providerId: 'prov1',
              providerService: { categoryId: 'cat1' },
            }),
            update: jest.fn(),
          },
          paymentTransaction: { create: jest.fn() },
          commission: { upsert: jest.fn() },
          providerEarning: { upsert: jest.fn() },
          payoutMethod: { findFirst: jest.fn().mockResolvedValue({ id: 'pm_default', type: 'MPESA', isDefault: true }), create: jest.fn() },
          payout: { upsert: jest.fn() },
          loyaltyTier: { upsert: jest.fn() },
          loyaltyAccount: { upsert: jest.fn().mockResolvedValue({ id: 'la1', customerId: 'cust1', balanceCents: 0n }), update: jest.fn() },
          loyaltyTransaction: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
          bookingStatusHistory: { create: jest.fn() },
        };
        return fn(capturedTx);
      });

      await svc.handleProviderEvent('mpesa', {
        providerRef: 'mpesa_ref_123', status: 'SUCCESSFUL', amount: 200000, currency: 'KES',
      });

      expect(capturedTx.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'EARN_BOOKING' }) }),
      );
    });

    it('does not award loyalty twice (idempotent)', async () => {
      const prisma = makePrisma();
      const commission = makeCommission();
      const gateway = makeGateway();
      const svc = service(prisma, gateway, commission);

      let capturedTx: any;
      prisma.$transaction.mockImplementation(async (fn: any) => {
        capturedTx = {
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'pay1', bookingId: 'b1', status: 'PENDING', grossCents: 200000n,
              currency: 'KES', expiresAt: new Date(Date.now() + 60000),
            }),
            update: jest.fn(),
          },
          booking: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'b1', status: 'AWAITING_PAYMENT', providerId: 'prov1',
              providerService: { categoryId: 'cat1' },
            }),
            update: jest.fn(),
          },
          paymentTransaction: { create: jest.fn() },
          commission: { upsert: jest.fn() },
          providerEarning: { upsert: jest.fn() },
          payoutMethod: { findFirst: jest.fn().mockResolvedValue({ id: 'pm_default', type: 'MPESA', isDefault: true }), create: jest.fn() },
          payout: { upsert: jest.fn() },
          loyaltyTier: { upsert: jest.fn() },
          loyaltyAccount: { upsert: jest.fn().mockResolvedValue({ id: 'la1', customerId: 'cust1', balanceCents: 0n }), update: jest.fn() },
          loyaltyTransaction: { findFirst: jest.fn().mockResolvedValue({ id: 'lt1' }), create: jest.fn() },
          bookingStatusHistory: { create: jest.fn() },
        };
        return fn(capturedTx);
      });

      await svc.handleProviderEvent('mpesa', {
        providerRef: 'mpesa_ref_123', status: 'SUCCESSFUL', amount: 200000, currency: 'KES',
      });

      expect(capturedTx.loyaltyTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    it('refunds a successful payment', async () => {
      const prisma = makePrisma();
      const gateway = makeGateway();
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay1', bookingId: 'b1', customerId: 'cust1', status: 'SUCCESSFUL',
        grossCents: 200000n, currency: 'KES', provider: 'mpesa', providerRef: 'ref1',
        booking: { id: 'b1', status: 'PAID' },
      });
      prisma.payment.findUniqueOrThrow.mockResolvedValue({
        id: 'pay1', bookingId: 'b1', customerId: 'cust1', status: 'REFUNDED',
        grossCents: 200000n, commissionCents: 20000n, netCents: 180000n,
        currency: 'KES', provider: 'mpesa', providerRef: 'ref1',
      });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'pay1', status: 'SUCCESSFUL', grossCents: 200000n, currency: 'KES',
              bookingId: 'b1', provider: 'mpesa', providerRef: 'ref1',
            }),
            update: jest.fn(),
          },
          refund: { create: jest.fn() },
          paymentTransaction: { create: jest.fn() },
          providerEarning: { updateMany: jest.fn() },
          loyaltyTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
          booking: {
            findUnique: jest.fn().mockResolvedValue({ id: 'b1', status: 'PAID' }),
            update: jest.fn(),
          },
          bookingStatusHistory: { create: jest.fn() },
        };
        return fn(tx);
      });
      const svc = service(prisma, gateway);

      const result = await svc.refund({ sub: 'cust1', role: 'CUSTOMER' }, 'pay1', 'Changed mind');

      expect(result.status).toBe('REFUNDED');
    });

    it('throws if payment not found', async () => {
      const prisma = makePrisma();
      prisma.payment.findUnique.mockResolvedValue(null);
      const svc = service(prisma);

      await expect(svc.refund({ sub: 'cust1', role: 'CUSTOMER' }, 'pay1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws if not the payment owner', async () => {
      const prisma = makePrisma();
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay1', customerId: 'other', status: 'SUCCESSFUL',
        grossCents: 200000n, booking: { id: 'b1', status: 'PAID' },
      });
      const svc = service(prisma);

      await expect(svc.refund({ sub: 'cust1', role: 'CUSTOMER' }, 'pay1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws if payment not successful', async () => {
      const prisma = makePrisma();
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay1', customerId: 'cust1', status: 'PENDING',
        grossCents: 200000n, booking: { id: 'b1', status: 'PENDING' },
      });
      const svc = service(prisma);

      await expect(svc.refund({ sub: 'cust1', role: 'CUSTOMER' }, 'pay1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows admin to refund any payment', async () => {
      const prisma = makePrisma();
      const gateway = makeGateway();
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay1', customerId: 'cust1', status: 'SUCCESSFUL',
        grossCents: 200000n, currency: 'KES', provider: 'mpesa', providerRef: 'ref1',
        booking: { id: 'b1', status: 'PAID' },
      });
      prisma.payment.findUniqueOrThrow.mockResolvedValue({
        id: 'pay1', customerId: 'cust1', status: 'REFUNDED',
        grossCents: 200000n, commissionCents: 20000n, netCents: 180000n,
        currency: 'KES', provider: 'mpesa', providerRef: 'ref1',
        booking: { id: 'b1', status: 'PAID' },
      });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'pay1', status: 'SUCCESSFUL', grossCents: 200000n, currency: 'KES',
              bookingId: 'b1', provider: 'mpesa', providerRef: 'ref1',
            }),
            update: jest.fn(),
          },
          refund: { create: jest.fn() },
          paymentTransaction: { create: jest.fn() },
          providerEarning: { updateMany: jest.fn() },
          loyaltyTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
          booking: {
            findUnique: jest.fn().mockResolvedValue({ id: 'b1', status: 'PAID' }),
            update: jest.fn(),
          },
          bookingStatusHistory: { create: jest.fn() },
        };
        return fn(tx);
      });
      const svc = service(prisma, gateway);

      const result = await svc.refund({ sub: 'admin1', role: 'ADMIN' }, 'pay1');
      expect(result.status).toBe('REFUNDED');
    });
  });

  describe('getForCustomer', () => {
    it('returns payment detail for the owner', async () => {
      const prisma = makePrisma();
      const paymentData = {
        id: 'pay1', customerId: 'cust1', status: 'SUCCESSFUL', method: 'MPESA',
        provider: 'mpesa', providerRef: 'ref1', grossCents: 200000n, commissionCents: 20000n,
        netCents: 180000n, currency: 'KES', expiresAt: null, createdAt: new Date(),
        transactions: [{ type: 'CAPTURE', amountCents: 200000n, currency: 'KES', createdAt: new Date() }],
        commission: { rateBasisPoints: 1000, baseCents: 200000n, commissionCents: 20000n, ruleSnapshot: {} },
        refunds: [],
      };
      prisma.payment.findUnique.mockResolvedValue(paymentData);
      prisma.payment.findUniqueOrThrow.mockResolvedValue(paymentData);
      const svc = service(prisma);

      const result = await svc.getForCustomer({ sub: 'cust1', role: 'CUSTOMER' }, 'pay1');
      expect(result.id).toBe('pay1');
      expect(result.transactions).toHaveLength(1);
    });

    it('throws if not owner and not admin', async () => {
      const prisma = makePrisma();
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay1', customerId: 'other', status: 'SUCCESSFUL',
      });
      const svc = service(prisma);

      await expect(svc.getForCustomer({ sub: 'cust1', role: 'CUSTOMER' }, 'pay1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
