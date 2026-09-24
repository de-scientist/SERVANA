import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';

const DIMS = [
  { name: 'Quality', score: 5 },
  { name: 'Professionalism', score: 5 },
  { name: 'Communication', score: 5 },
  { name: 'Punctuality', score: 5 },
  { name: 'Value', score: 5 },
] as any;

function makePrisma(opts: {
  booking?: any;
  existingReview?: any;
  review?: any;
  profile?: any;
} = {}) {
  return {
    booking: {
      findUnique: jest.fn().mockResolvedValue(opts.booking ?? null),
    },
    review: {
      findUnique: jest.fn().mockResolvedValue(opts.existingReview ?? opts.review ?? null),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'rev1', ...data })),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    reviewDimension: {
      createMany: jest.fn().mockResolvedValue({ count: 5 }),
    },
    reviewResponse: {
      upsert: jest.fn().mockImplementation(async ({ create }: any) => ({ id: 'resp1', ...create })),
    },
    providerProfile: {
      findUnique: jest.fn(async ({ where }: any) => {
        const p = opts.profile ?? { id: 'prov1', userId: 'user-prov' };
        if (!p) return null;
        if (where.id && where.id === p.id) return p;
        if (where.userId && where.userId === p.userId) return p;
        return null;
      }),
    },
    providerVerification: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(async (fn: any) => {
      const tx = {
        review: {
          create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'rev1', ...data })),
        },
        reviewDimension: { createMany: jest.fn().mockResolvedValue({ count: 5 }) },
      };
      return fn(tx);
    }),
  } as any;
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeLogger() {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
}

function completedBooking(overrides: Record<string, any> = {}) {
  return {
    id: 'b1',
    customerId: 'cust1',
    providerId: 'prov1',
    status: 'COMPLETED',
    payment: { status: 'SUCCESSFUL' },
    ...overrides,
  };
}

describe('ReviewsService', () => {
  describe('create (review protection)', () => {
    it('creates a review for a valid completed + paid booking', async () => {
      const prisma = makePrisma({ booking: completedBooking(), existingReview: null });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());

      const result: any = await svc.create({ sub: 'cust1', role: 'CUSTOMER' }, {
        bookingId: 'b1',
        overall: 5,
        body: 'Outstanding service, highly professional.',
        dimensions: DIMS,
      } as any);

      expect(result.id).toBe('rev1');
      expect(result.providerId).toBe('prov1');
    });

    it('rejects reviews for non-completed bookings', async () => {
      const prisma = makePrisma({ booking: completedBooking({ status: 'IN_PROGRESS' }) });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());

      await expect(
        svc.create({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1', overall: 5, dimensions: DIMS } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects fake-transaction reviews (payment not successful)', async () => {
      const prisma = makePrisma({
        booking: completedBooking({ payment: { status: 'PENDING' } }),
      });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());

      await expect(
        svc.create({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1', overall: 5, dimensions: DIMS } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects reviews for unpaid bookings (no payment row)', async () => {
      const prisma = makePrisma({ booking: completedBooking({ payment: null }) });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());

      await expect(
        svc.create({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1', overall: 5, dimensions: DIMS } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects reviews for another customer's booking", async () => {
      const prisma = makePrisma({ booking: completedBooking() });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());

      await expect(
        svc.create({ sub: 'cust-other', role: 'CUSTOMER' }, { bookingId: 'b1', overall: 5, dimensions: DIMS } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects duplicate reviews for the same booking', async () => {
      const prisma = makePrisma({ booking: completedBooking(), existingReview: { id: 'rev-old' } });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());

      await expect(
        svc.create({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1', overall: 5, dimensions: DIMS } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects duplicated dimension names', async () => {
      const prisma = makePrisma({ booking: completedBooking(), existingReview: null });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());
      const dupes = [
        { name: 'Quality', score: 5 },
        { name: 'Quality', score: 4 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 5 },
        { name: 'Value', score: 5 },
      ] as any;

      await expect(
        svc.create({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1', overall: 5, dimensions: dupes } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound for unknown bookings', async () => {
      const prisma = makePrisma({ booking: null });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());

      await expect(
        svc.create({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1', overall: 5, dimensions: DIMS } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('respond', () => {
    it('lets the owning provider respond (user id → profile id resolution)', async () => {
      const prisma = makePrisma({ review: { id: 'rev1', providerId: 'prov1' } });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());

      const result = await svc.respond({ sub: 'user-prov', role: 'PROVIDER' }, 'rev1', {
        body: 'Thank you for the kind words!',
      });

      expect(result.body).toBe('Thank you for the kind words!');
      expect(prisma.reviewResponse.upsert).toHaveBeenCalled();
    });

    it("blocks responses to another provider's reviews", async () => {
      const prisma = makePrisma({
        review: { id: 'rev1', providerId: 'prov-other' },
        profile: { id: 'prov1', userId: 'user-prov' },
      });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());

      await expect(
        svc.respond({ sub: 'user-prov', role: 'PROVIDER' }, 'rev1', { body: 'Trying to hijack this review thread here' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks customers from responding', async () => {
      const prisma = makePrisma({ review: { id: 'rev1', providerId: 'prov1' } });
      const svc = new ReviewsService(prisma, makeAudit(), makeLogger());

      await expect(
        svc.respond({ sub: 'cust1', role: 'CUSTOMER' }, 'rev1', { body: 'Fake provider response attempt' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('moderate', () => {
    it('lets admins transition review status with audit', async () => {
      const prisma = makePrisma({ review: { id: 'rev1', status: 'APPROVED' } });
      prisma.review.update.mockResolvedValue({ id: 'rev1', status: 'REJECTED' });
      const audit = makeAudit();
      const svc = new ReviewsService(prisma, audit, makeLogger());

      const result: any = await svc.moderate({ sub: 'admin1', role: 'ADMIN' }, 'rev1', {
        action: 'REJECT',
        notes: 'Spam',
      } as any);

      expect(result.status).toBe('REJECTED');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'review.moderated' }),
      );
    });

    it('blocks non-admins from moderating', async () => {
      const svc = new ReviewsService(makePrisma(), makeAudit(), makeLogger());

      await expect(
        svc.moderate({ sub: 'cust1', role: 'CUSTOMER' }, 'rev1', { action: 'REMOVE' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
