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
        paymentTransaction: { create: jest.fn() },
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

describe('PayoutService', () => {
  describe('getEarningsDashboard', () => {
    it('returns dashboard for provider', async () => {
      const prisma = makePrisma();
      prisma.providerEarning.findMany.mockResolvedValue([
        { grossCents: 200000n, commissionCents: 20000n, feeCents: 0n, refundCents: 0n, adjustmentCents: 0n, netCents: 180000n, status: 'AVAILABLE' },
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
      const payoutData = { id: 'p1', providerId: 'prov1', status: 'PENDING', totalCents: 180000n, currency: 'KES', createdAt: new Date() };
      const updatedPayout = { ...payoutData, status: 'SUCCESSFUL', totalCents: 180000n, currency: 'KES', items: [{ id: 'pi1', earningId: 'e1', amountCents: 180000n }], method: { id: 'm1', type: 'MPESA', isDefault: true } };
      prisma.payout.findUnique
        .mockResolvedValueOnce({
          ...payoutData,
          items: [{ id: 'pi1', earningId: 'e1', amountCents: 180000n }],
          method: { id: 'm1', type: 'MPESA', isDefault: true },
        })
        .mockResolvedValueOnce(updatedPayout);
      prisma.providerEarning.findMany.mockResolvedValue([
        { id: 'e1', providerId: 'prov1', netCents: 180000n, status: 'AVAILABLE' },
      ]);
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payout: {
            findUnique: jest.fn().mockResolvedValue(updatedPayout),
            update: jest.fn().mockResolvedValue({ id: 'p1', status: 'SUCCESSFUL', totalCents: 180000n, currency: 'KES' }),
            count: jest.fn(),
          },
          providerEarning: {
            findUnique: jest.fn().mockResolvedValue({ id: 'e1', providerId: 'prov1', netCents: 180000n, status: 'AVAILABLE' }),
            findMany: jest.fn().mockResolvedValue([{ id: 'e1', providerId: 'prov1', netCents: 180000n, status: 'AVAILABLE' }]),
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
    it('transitions FAILED → PENDING', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique
        .mockResolvedValueOnce({ id: 'p1', status: 'FAILED', totalCents: 180000n, currency: 'KES' })
        .mockResolvedValueOnce({ id: 'p1', status: 'PENDING', totalCents: 180000n, currency: 'KES' });
      prisma.payout.update.mockResolvedValue({ id: 'p1', status: 'PENDING', totalCents: 180000n, currency: 'KES' });
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
  });

  describe('reversePayout', () => {
    it('transitions SUCCESSFUL → REVERSED and restores earnings', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({
        id: 'p1', providerId: 'prov1', status: 'SUCCESSFUL', totalCents: 180000n, currency: 'KES',
        items: [{ id: 'pi1', earningId: 'e1', amountCents: 180000n }],
      });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payout: {
            update: jest.fn().mockResolvedValue({ id: 'p1', status: 'REVERSED', totalCents: 180000n, currency: 'KES' }),
            findUnique: jest.fn().mockResolvedValue({ id: 'p1', providerId: 'prov1', status: 'REVERSED', totalCents: 180000n, currency: 'KES', items: [{ id: 'pi1', earningId: 'e1', amountCents: 180000n }] }),
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
    it('creates adjustment and audits it', async () => {
      const prisma = makePrisma();
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'SUCCESSFUL', totalCents: 180000n, currency: 'KES' });
      prisma.paymentTransaction.create.mockResolvedValue({ id: 'at1', amountCents: 5000n });
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
  });

  describe('reconcile', () => {
    it('returns reconciliation data', async () => {
      const prisma = makePrisma();
      prisma.payment.findMany.mockResolvedValue([{ grossCents: 200000n }]);
      prisma.commission.findMany.mockResolvedValue([{ commissionCents: 20000n }]);
      prisma.providerEarning.findMany.mockResolvedValue([{ netCents: 180000n }]);
      prisma.payout.findMany.mockResolvedValue([{ totalCents: 180000n, status: 'SUCCESSFUL' }]);
      const svc = service(prisma);

      const result = await svc.reconcile({ sub: 'admin1', role: 'ADMIN' }, { providerId: 'prov1' });

      expect(result.paymentsCount).toBe(1);
      expect(result.paymentsTotalCents).toBe('200000');
      expect(result.discrepancyCents).toBe('0');
    });

    it('throws ForbiddenException for customer', async () => {
      const svc = service();
      await expect(svc.reconcile({ sub: 'cust1', role: 'CUSTOMER' }, {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
