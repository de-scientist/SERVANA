import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FraudService } from './fraud.service';

function makePrisma(opts: {
  alerts?: any[];
  open?: any[];
} = {}) {
  return {
    review: { findMany: jest.fn().mockResolvedValue([]) },
    booking: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    refund: { findMany: jest.fn().mockResolvedValue([]) },
    referral: { findMany: jest.fn().mockResolvedValue([]) },
    referralCode: { findMany: jest.fn().mockResolvedValue([]) },
    payout: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    providerProfile: { findMany: jest.fn().mockResolvedValue([]) },
    fraudAlert: {
      findMany: jest.fn().mockImplementation(async (args?: any) => {
        if (args?.where?.status === 'OPEN') return opts.open ?? [];
        return opts.alerts ?? [];
      }),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue((opts.alerts ?? []).length),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'al1', ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'al1', status: 'OPEN', ...data })),
    },
  } as any;
}

function svc(prisma?: any, ai?: any) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const aiSvc = ai ?? { complete: jest.fn().mockResolvedValue({ text: 'note', model: 'stub-0', provider: 'stub' }) };
  return { service: new FraudService(prisma ?? makePrisma(), audit, aiSvc), audit };
}

describe('FraudService', () => {
  describe('scan', () => {
    it('persists MEDIUM+ findings and reports LOW as informational only', async () => {
      const now = Date.now();
      const prisma = makePrisma();
      // Fake-review burst: 5 five-stars in a day.
      prisma.review.findMany.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          id: `r${i}`, providerId: 'p1', customerId: `c${i}`, overall: 5,
          title: `Superb work ${i}`, body: `Absolutely loved the experience number ${i} today`, createdAt: new Date(now - 3600_000),
        })),
      );
      const { service, audit } = svc(prisma);

      const out = await service.scan('admin1', { days: 30 } as any);

      expect(out.findings).toBeGreaterThan(0);
      expect(out.created).toBeGreaterThan(0);
      expect(prisma.fraudAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'OPEN', entityId: 'p1' }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'fraud.scan' }));
    });

    it('dedupes against already-OPEN alerts', async () => {
      const now = Date.now();
      const prisma = makePrisma({
        open: [{ checkKey: 'fake-review-burst', entityType: 'provider', entityId: 'p1' }],
      });
      prisma.review.findMany.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          id: `r${i}`, providerId: 'p1', customerId: `c${i}`, overall: 5,
          title: `Great ${i}`, body: `Unique detailed review content piece ${i} about service`, createdAt: new Date(now - 3600_000),
        })),
      );
      const { service } = svc(prisma);

      const out = await service.scan('admin1', { days: 30 } as any);
      expect(out.skippedDuplicates).toBeGreaterThanOrEqual(1);
      expect(prisma.fraudAlert.create).not.toHaveBeenCalled();
    });

    it('scopes scans to a single entity when asked', async () => {
      const prisma = makePrisma();
      const { service } = svc(prisma);

      const out = await service.scan('admin1', { days: 30, entityType: 'provider', entityId: 'ghost' } as any);
      expect(out.created).toBe(0);
    });
  });

  describe('review (human-only path to action)', () => {
    it('blocks non-admins', async () => {
      const { service } = svc();
      await expect(service.review('u1', 'CUSTOMER', 'al1', { status: 'REVIEWED' } as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('404s unknown alerts and rejects double-terminal transitions', async () => {
      const { service } = svc();
      await expect(service.review('a', 'ADMIN', 'nope', { status: 'REVIEWED' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('requires a note for ACTIONED and audits the decision', async () => {
      const prisma = makePrisma();
      prisma.fraudAlert.findUnique.mockResolvedValue({ id: 'al1', status: 'OPEN' });
      const { service, audit } = svc(prisma);

      await expect(
        service.review('a', 'ADMIN', 'al1', { status: 'ACTIONED' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      const done: any = await service.review('a', 'ADMIN', 'al1', {
        status: 'ACTIONED', note: 'Warned provider via support; reviews rejected',
      } as any);
      expect(done.status).toBe('ACTIONED');
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'fraud.review' }));
    });

    it('exposes no punishment capability (alerts only)', async () => {
      const proto = Object.getOwnPropertyNames(FraudService.prototype);
      for (const name of ['suspend', 'refund', 'payout', 'ban', 'delete', 'charge']) {
        expect(proto.some((m) => m.toLowerCase().includes(name))).toBe(false);
      }
    });
  });

  describe('annotate', () => {
    it('attaches an AI analyst note with model attribution', async () => {
      const prisma = makePrisma();
      prisma.fraudAlert.findUnique.mockResolvedValue({
        id: 'al1', checkKey: 'k', score: 80, reason: 'r', evidence: { a: 1 },
      });
      const { service } = svc(prisma);

      const out: any = await service.annotate('admin1', 'al1');
      expect(out.evidence.aiNote).toBe('note');
      expect(out.evidence.aiModel).toBe('stub-0');
    });

    it('degrades to the rule finding when the model fails', async () => {
      const prisma = makePrisma();
      prisma.fraudAlert.findUnique.mockResolvedValue({ id: 'al1', checkKey: 'k', score: 80, reason: 'r', evidence: {} });
      const failing = { complete: jest.fn().mockRejectedValue(new Error('down')) };
      const { service } = svc(prisma, failing);

      const out: any = await service.annotate('admin1', 'al1');
      expect(out.aiNote).toBeNull();
    });
  });
});
