import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReferralService } from './referral.service';

function makePrisma(opts: {
  code?: any;
  referral?: any;
  booking?: any;
  paymentStatus?: string;
} = {}) {
  return {
    referralCode: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(opts.code ?? null),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'code1', ...data })),
    },
    referral: {
      findFirst: jest.fn().mockResolvedValue(opts.referral ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'ref1', rewardStatus: 'PENDING', ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'ref1', ...data })),
    },
    booking: {
      findFirst: jest.fn().mockResolvedValue(opts.booking ?? null),
      findUnique: jest.fn().mockResolvedValue(
        opts.booking === undefined
          ? { id: 'b1', customerId: 'user-new', status: 'COMPLETED', payment: { status: opts.paymentStatus ?? 'SUCCESSFUL' } }
          : opts.booking,
      ),
    },
  } as any;
}

function svc(prisma?: any, loyalty?: any) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const logger = { warn: jest.fn(), log: jest.fn() } as any;
  const loy = loyalty ?? { earn: jest.fn().mockResolvedValue({ transaction: { id: 'lt1' } }) };
  return { service: new ReferralService(prisma ?? makePrisma(), audit, loy, logger), audit, loyalty: loy };
}

describe('ReferralService', () => {
  describe('claim (abuse guards)', () => {
    it('claims a valid code', async () => {
      const prisma = makePrisma({ code: { id: 'code1', customerId: 'user-ref', code: 'SVN-ABC123' } });
      prisma.booking.findFirst.mockResolvedValue(null);
      const { service } = svc(prisma);

      const result = await service.claim('user-new', 'svn-abc123');
      expect(result.code).toBe('SVN-ABC123');
      expect(prisma.referral.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ codeId: 'code1', referredId: 'user-new' }) }),
      );
    });

    it('rejects unknown codes', async () => {
      const { service } = svc(makePrisma({ code: null }));
      await expect(service.claim('user-new', 'SVN-NOPE')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects self-referral', async () => {
      const prisma = makePrisma({ code: { id: 'code1', customerId: 'user1', code: 'SVN-SELF' } });
      const { service } = svc(prisma);
      await expect(service.claim('user1', 'SVN-SELF')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects double-claims on one account', async () => {
      const prisma = makePrisma({
        code: { id: 'code2', customerId: 'user-ref', code: 'SVN-TWO' },
        referral: { id: 'ref-old', referredId: 'user-new' },
      });
      const { service } = svc(prisma);
      await expect(service.claim('user-new', 'SVN-TWO')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-first-timers', async () => {
      const prisma = makePrisma({
        code: { id: 'code1', customerId: 'user-ref', code: 'SVN-ABC123' },
        booking: { id: 'b-old', status: 'COMPLETED' },
      });
      const { service } = svc(prisma);
      await expect(service.claim('user-old', 'SVN-ABC123')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('qualifyOnBookingComplete', () => {
    it('pays the referrer after the first completed + paid booking', async () => {
      const prisma = makePrisma({
        code: { id: 'code1', customerId: 'user-ref', code: 'SVN-ABC123' },
        referral: { id: 'ref1', codeId: 'code1', referredId: 'user-new', rewardStatus: 'PENDING', firstBookingId: null },
      });
      const { service, loyalty } = svc(prisma);

      await service.qualifyOnBookingComplete('b1');

      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ firstBookingId: 'b1', rewardStatus: 'QUALIFIED' }) }),
      );
      expect(loyalty.earn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: 'user-ref', event: 'REFERRAL', refType: 'REFERRAL', refId: 'ref1' }),
      );
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { rewardStatus: 'PAID' } }),
      );
    });

    it('ignores unpaid bookings (no phantom rewards)', async () => {
      const prisma = makePrisma({ paymentStatus: 'PENDING' });
      const { service, loyalty } = svc(prisma);

      await service.qualifyOnBookingComplete('b1');

      expect(prisma.referral.update).not.toHaveBeenCalled();
      expect(loyalty.earn).not.toHaveBeenCalled();
    });

    it('never throws (booking flow is sacred)', async () => {
      const prisma = makePrisma();
      prisma.booking.findUnique.mockRejectedValue(new Error('db down'));
      const { service } = svc(prisma);

      await expect(service.qualifyOnBookingComplete('b1')).resolves.toBeUndefined();
    });
  });
});
