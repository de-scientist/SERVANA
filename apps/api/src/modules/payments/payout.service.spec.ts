import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayoutService } from './payout.service';

function makePrisma() {
  return {
    providerEarning: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    payout: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    payoutItem: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
    },
    commission: {
      findMany: jest.fn(),
    },
    paymentTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => {
      const tx = {
        payout: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
          update: jest.fn(),
          create: jest.fn(),
          count: jest.fn(),
        },
        providerEarning: {
          findMany: jest.fn(),
          update: jest.fn(),
        },
        payoutItem: {
          findMany: jest.fn(),
          update: jest.fn(),
        },
        paymentTransaction: { create: jest.fn(), findMany: jest.fn() },
        auditLog: { create: jest.fn() },
      };
      return fn(tx);
    }),
  } as any;
}

function makeGateway() {
  return {
    getById: jest.fn().mockReturnValue({ id: 'prov1', name: 'Test Provider', methods: ['MPESA'] }),
    get: jest.fn().mockReturnValue({ id: 'other', name: 'Other', methods: ['OTHER'] }),
  };
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

function service(prisma?: any, audit?: any) {
  return new PayoutService(prisma ?? makePrisma(), audit ?? makeAudit());
}

function makePayoutData(overrides: Record<string, any> = {}) {
  return {
    id: 'p1',
    providerId: 'prov1',
    status: 'PENDING',
    totalCents: 180000n,
    currency: 'KES',
    reference: 'PO_1',
    retryCount: 0,
    failedCount: 0,
    createdAt: new Date(),
    items: [],
    method: null,
    ...overrides,
  };
}

describe('PayoutService', () => {
  describe('getEarningsDashboard', () => {
    it('returns dashboard for provider with all financial fields', async () => {
      const prisma = makePrisma();
      prisma.providerEarning.findMany.mockResolvedValue([
        { grossCents: 200000n, commissionCents: 20000n, feeCents: 5000n, refundCents: 0n, adjustmentCents: 0n, netCents: 180000n, status: 'AVAILABLE' },
      ]);
      prisma.payout.findMany.mockResolvedValue([
        { totalCents: 180000n, status: 'SUCCESSFUL' },
      ]);
      prisma.payment.findMany.mockResolvedValue([]);
      const svc = service(prisma);

      const result = await svc.getEarningsDashboard({ sub: 'prov1', role: 'PROVIDER' });

      expect(result.providerId).toBe('prov1');
      expect(result.totalGrossCents).toBe('200000');
      expect(result.totalCommissionCents).toBe('20000');
      expect(result.totalPaymentFeesCents).toBe('5000');
      expect(result.totalPaidOutCents).toBe('180000');
    });

    it('throws ForbiddenException for customer', async () => {
      const svc = service();
      await expect(svc.getEarningsDashboard({ sub: 'cust1', role: 'CUSTOMER' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for provider viewing other provider', async () => {
      const svc = service();
      await expect(svc.getEarningsDashboard({ sub: 'prov1', role: 'PROVIDER' }, 'prov2')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('listPayouts', () => {
    it('lists payouts for provider', async () => {
      const prisma = makePrisma();
      prisma.payout.findMany.mockResolvedValue([
        { id: 'p1', providerId: 'prov1', status: 'SUCCESSFUL', totalCents: 180000n, currency: 'KES', reference: 'PO_1', items: [], method: null, createdAt: new Date() },
      ]);
      prisma.payout.count.mockResolvedValue(1);
      const svc = service(prisma);

      const result = await svc.listPayouts({ sub: 'prov1', role: 'PROVIDER' }, {});

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('throws ForbiddenException for customer', async () => {
      const svc = service();
      await expect(svc.listPayouts({ sub: 'cust1', role: 'CUSTOMER' }, {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('processPayout', () => {
    it('transitions PENDING → PROCESSING → SUCCESSFUL', async () => {
      const prisma = makePrisma();
      const payoutData = makePayoutData({ id: 'p1', providerId: 'prov1', status: 'PENDING' });
      const updatedPayout = { ...payoutData, status: 'SUCCESSFUL' };
      prisma.payout.findUnique
        .mockResolvedValueOnce({
          ...payoutData,
          items: [{ id: 'pi1', earningId: 'e1', amountCents: 180000n }],
          method: { id: 'm1', type: 'MPESA', isDefault: true },
        })
        .mockResolvedValueOnce(updatedPayout);
      prisma.providerEarning.findUnique.mockResolvedValue({ id: 'e1', providerId: 'prov1', netCents: 180000n, status: 'AVAILABLE' });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payout: {
            findUnique: jest.fn().mockResolvedValue(updatedPayout),
            update: jest.fn().mockResolvedValue({ id: 'p1', status: 'SUCCESSFUL', totalCents: 180000n, currency: 'KES', retryCount: 0, failedCount: 0 }),
            count: jest.fn(),
          },
          providerEarning: {
            findUnique: jest.fn().mockResolvedValue({ id: 'e1', providerId: 'prov1', netCents: 180000n, status: 'AVAILABLE' }),
            findMany: jest.fn(),
            update: jest.fn().mockResolvedValue({ id: 'e1', status: 'PAID' }),
          },
          payoutItem: { findUnique: jest.fn().mockResolvedValue({ id: 'pi1', amountCents: 180000n }), update: jest.fn() },
          paymentTransaction: { create: jest.fn() },
          auditLog: { create: jest.fn() },
        };
        return fn(tx);
      });
      const svc = service(prisma);

      const result = await svc.processPayout({ sub: 'prov1', role: 'PROVIDER' }, 'p1');
      expect(result.status).toBe('SUCCESSFUL');
    });

    it('transitions to FAILED when all earning items are ineligible', async () => {
      const prisma = makePrisma();
      const payoutData = makePayoutData({ id: 'p1', providerId: 'prov1', status: 'PENDING', items: [{ id: 'pi1', earningId: 'e1', amountCents: 180000n }] });
      prisma.payout.findUnique
        .mockResolvedValueOnce({ ...payoutData, method: { id: 'm1', type: 'MPESA', isDefault: true } })
        .mockResolvedValueOnce({ ...payoutData, status: 'FAILED', failedCount: 1 });
      prisma.providerEarning.findUnique.mockResolvedValue({ id: 'e1', providerId: 'prov1', netCents: 180000n, status: 'REVERSED' });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payout: {
            findUnique: jest.fn().mockResolvedValue({ ...payoutData, status: 'FAILED', failedCount: 1 }),
            update: jest.fn().mockResolvedValue({ id: 'p1', status: 'FAILED', failedCount: 1, retryCount: 0, totalCents: 180000n }),
            count: jest.fn(),
          },
          providerEarning: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', status: 'REVERSED' }), findMany: jest.fn(), update: jest.fn() },
          payoutItem: { findMany: jest.fn() },
          paymentTransaction: { create: jest.fn() },
          auditLog: { create: jest.fn() },
        };
        return fn(tx);
      });
      const svc = service(prisma);

      const result = await svc.processPayout({ sub: 'prov1', role: 'PROVIDER' }, 'p1');
      expect(result.status).toBe('FAILED');
    });

    it('throws BadRequestException for non-PENDING payout', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'SUCCESSFUL' });
      const svc = service(prisma);

      await expect(svc.processPayout({ sub: 'prov1', role: 'PROVIDER' }, 'p1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException for provider not owning payout', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1', providerId: 'other', status: 'PENDING' });
      const svc = service(prisma);

      await expect(svc.processPayout({ sub: 'prov1', role: 'PROVIDER' }, 'p1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('retryPayout', () => {
    it('transitions FAILED → PENDING with retryCount increment', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique
        .mockResolvedValueOnce({ id: 'p1', status: 'FAILED', totalCents: 180000n, currency: 'KES', retryCount: 1, reference: 'PO_1', providerId: 'prov1', methodId: 'm1' })
        .mockResolvedValueOnce({ id: 'p1', status: 'PENDING', totalCents: 180000n, currency: 'KES', retryCount: 2, reference: 'PO_1', providerId: 'prov1', methodId: 'm1' });
      prisma.payout.update.mockResolvedValue({ id: 'p1', status: 'PENDING', retryCount: 2, totalCents: 180000n, currency: 'KES', reference: 'PO_1', providerId: 'prov1', methodId: 'm1' });
      const svc = service(prisma);

      const result = await svc.retryPayout({ sub: 'admin1', role: 'ADMIN' }, 'p1');
      expect(result.status).toBe('PENDING');
    });

    it('throws BadRequestException for non-FAILED payout', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'SUCCESSFUL', totalCents: 180000n, currency: 'KES' });
      const svc = service(prisma);

      await expect(svc.retryPayout({ sub: 'admin1', role: 'ADMIN' }, 'p1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when max retries exceeded', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'FAILED', retryCount: 3 });
      const svc = service(prisma);

      await expect(svc.retryPayout({ sub: 'admin1', role: 'ADMIN' }, 'p1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('failPayout', () => {
    it('transitions PROCESSING → FAILED', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValueOnce({ id: 'p1', status: 'PROCESSING', totalCents: 180000n, currency: 'KES' });
      prisma.payout.update.mockResolvedValue({ id: 'p1', status: 'FAILED', totalCents: 180000n, currency: 'KES', retryCount: 0, failedCount: 0, reference: 'PO_1', providerId: 'prov1', methodId: 'm1', createdAt: new Date() });
      prisma.payout.findUnique.mockResolvedValueOnce({ id: 'p1', status: 'FAILED', totalCents: 180000n, currency: 'KES', retryCount: 0, failedCount: 0, reference: 'PO_1', providerId: 'prov1', methodId: 'm1', createdAt: new Date() });
      const svc = service(prisma);

      const result = await svc.failPayout({ sub: 'admin1', role: 'ADMIN' }, 'p1', 'Simulated failure');
      expect(result.status).toBe('FAILED');
    });

    it('throws BadRequestException for non-PROCESSING payout', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'PENDING' });
      const svc = service(prisma);

      await expect(svc.failPayout({ sub: 'admin1', role: 'ADMIN' }, 'p1', 'Test')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException for non-admin', async () => {
      const svc = service();
      await expect(svc.failPayout({ sub: 'prov1', role: 'PROVIDER' }, 'p1', 'Test')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('reversePayout', () => {
    it('transitions SUCCESSFUL → REVERSED and restores earnings', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({
        id: 'p1', providerId: 'prov1', status: 'SUCCESSFUL', totalCents: 180000n, currency: 'KES', reference: 'PO_1', retryCount: 0, failedCount: 0,
        items: [{ id: 'pi1', earningId: 'e1', amountCents: 180000n }],
      });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payout: {
            update: jest.fn().mockResolvedValue({ id: 'p1', status: 'REVERSED', totalCents: 180000n, currency: 'KES', reference: 'PO_1', providerId: 'prov1', retryCount: 0, failedCount: 0 }),
            findUnique: jest.fn().mockResolvedValue({ id: 'p1', providerId: 'prov1', status: 'REVERSED', totalCents: 180000n, currency: 'KES', reference: 'PO_1', retryCount: 0, failedCount: 0, items: [{ id: 'pi1', earningId: 'e1', amountCents: 180000n }] }),
          },
          providerEarning: { update: jest.fn().mockResolvedValue({ id: 'e1', status: 'AVAILABLE' }) },
          paymentTransaction: { create: jest.fn() },
          auditLog: { create: jest.fn() },
        };
        return fn(tx);
      });
      const svc = service(prisma);

      const result = await svc.reversePayout({ sub: 'admin1', role: 'ADMIN' }, 'p1', 'Provider requested reversal');
      expect(result.status).toBe('REVERSED');
    });

    it('throws BadRequestException for non-SUCCESSFUL payout', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'PENDING' });
      const svc = service(prisma);

      await expect(svc.reversePayout({ sub: 'admin1', role: 'ADMIN' }, 'p1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('adjustPayout', () => {
    it('creates adjustment, updates total, and audits it', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'SUCCESSFUL', totalCents: 180000n, currency: 'KES', reference: 'PO_1', providerId: 'prov1', retryCount: 0, failedCount: 0 });
      prisma.paymentTransaction.create.mockResolvedValue({ id: 'at1', amountCents: 5000n });
      prisma.payout.update.mockResolvedValue({ id: 'p1', totalCents: 185000n, status: 'SUCCESSFUL', currency: 'KES', reference: 'PO_1', providerId: 'prov1', retryCount: 0, failedCount: 0 });
      const svc = service(prisma);

      const result = await svc.adjustPayout({ sub: 'admin1', role: 'ADMIN' }, 'p1', 5000n, 'Late payment adjustment');
      expect(result.amountCents).toBe('5000');
      expect(result.reason).toBe('Late payment adjustment');
    });

    it('throws ForbiddenException for non-admin', async () => {
      const svc = service();
      await expect(svc.adjustPayout({ sub: 'prov1', role: 'PROVIDER' }, 'p1', 5000n, 'Test')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException for reversed payout', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'REVERSED' });
      const svc = service(prisma);

      await expect(svc.adjustPayout({ sub: 'admin1', role: 'ADMIN' }, 'p1', 5000n, 'Test')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for negative total after adjustment', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'SUCCESSFUL', totalCents: 1000n, currency: 'KES' });
      const svc = service(prisma);

      await expect(svc.adjustPayout({ sub: 'admin1', role: 'ADMIN' }, 'p1', -2000n, 'Too much')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reconcile', () => {
    it('returns reconciliation data with ledger integrity', async () => {
      const prisma = makePrisma();
      prisma.payment.findMany.mockResolvedValue([{ grossCents: 200000n }]);
      prisma.commission.findMany.mockResolvedValue([{ commissionCents: 20000n }]);
      prisma.paymentTransaction.findMany.mockResolvedValue([]);
      prisma.providerEarning.findMany.mockResolvedValue([{ netCents: 180000n }]);
      prisma.payout.findMany.mockResolvedValue([{ totalCents: 180000n, status: 'SUCCESSFUL' }]);
      const svc = service(prisma);

      const result = await svc.reconcile({ sub: 'admin1', role: 'ADMIN' }, { providerId: 'prov1' });

      expect(result.paymentsCount).toBe(1);
      expect(result.paymentsTotalCents).toBe('200000');
      expect(result.discrepancyCents).toBe('0');
      expect(result.ledgerIntact).toBe(true);
    });

    it('detects ledger discrepancy', async () => {
      const prisma = makePrisma();
      prisma.payment.findMany.mockResolvedValue([{ grossCents: 200000n }]);
      prisma.commission.findMany.mockResolvedValue([{ commissionCents: 20000n }]);
      prisma.paymentTransaction.findMany.mockResolvedValue([]);
      prisma.providerEarning.findMany.mockResolvedValue([{ netCents: 150000n }]);
      prisma.payout.findMany.mockResolvedValue([{ totalCents: 150000n, status: 'SUCCESSFUL' }]);
      const svc = service(prisma);

      const result = await svc.reconcile({ sub: 'admin1', role: 'ADMIN' }, { providerId: 'prov1' });

      expect(result.discrepancyCents).toBe('30000');
      expect(result.ledgerIntact).toBe(false);
    });

    it('throws ForbiddenException for customer', async () => {
      const svc = service();
      await expect(svc.reconcile({ sub: 'cust1', role: 'CUSTOMER' }, {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('adminDashboard', () => {
    it('returns admin dashboard with failed payouts', async () => {
      const prisma = makePrisma();
      prisma.payout.findMany.mockResolvedValue([
        { id: 'p1', providerId: 'prov1', status: 'FAILED', totalCents: 180000n, currency: 'KES', reference: 'PO_1', retryCount: 2, failedCount: 1, items: [], method: null, createdAt: new Date() },
      ]);
      prisma.payout.count.mockResolvedValue(1);
      const svc = service(prisma);

      const result = await svc.adminDashboard({ sub: 'admin1', role: 'ADMIN' }, { status: 'FAILED' });

      expect(result.data.summary.failedCount).toBe(1);
      expect(result.data.failedPayouts).toHaveLength(1);
    });
  });

  describe('getTransactionDetail', () => {
    it('returns full transaction detail', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({
        id: 'p1', providerId: 'prov1', status: 'SUCCESSFUL', totalCents: 180000n, currency: 'KES',
        reference: 'PO_1', retryCount: 0, failedCount: 0,
        items: [{ id: 'pi1', earningId: 'e1', earning: { status: 'PAID' } }],
        method: { type: 'MPESA', detailsRef: '411***1234' },
        transactions: [{ id: 't1', type: 'ADJUSTMENT', amountCents: 5000n, currency: 'KES', createdAt: new Date() }],
      });
      const svc = service(prisma);

      const result = await svc.getTransactionDetail({ sub: 'prov1', role: 'PROVIDER' }, 'p1');

      expect(result.status).toBe('SUCCESSFUL');
      expect(result.transactions).toHaveLength(1);
      expect(result.method?.type).toBe('MPESA');
    });
  });
});
