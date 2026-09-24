import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

function makeDb(opts: {
  rules?: Array<{ event: string; points: number; active: boolean }>;
  tiers?: Array<{ id: string; name: string; thresholdCents: bigint }>;
  profile?: any;
  account?: any;
  txns?: any[];
  dupTxn?: any;
} = {}) {
  const rules = opts.rules ?? [
    { event: 'BOOKING', points: 20, active: true },
    { event: 'REVIEW', points: 5, active: true },
    { event: 'REFERRAL', points: 50, active: true },
    { event: 'PURCHASE', points: 10, active: true },
    { event: 'SIGNUP', points: 10, active: true },
  ];
  const tiers = opts.tiers ?? [
    { id: 'new', name: 'NEW', thresholdCents: 0n },
    { id: 'bronze', name: 'BRONZE', thresholdCents: 100n },
    { id: 'silver', name: 'SILVER', thresholdCents: 500n },
    { id: 'gold', name: 'GOLD', thresholdCents: 1500n },
    { id: 'platinum', name: 'PLATINUM', thresholdCents: 5000n },
    { id: 'vip', name: 'VIP', thresholdCents: 15000n },
  ];
  const profile = opts.profile === undefined ? { id: 'prof1', userId: 'user1' } : opts.profile;
  const account = opts.account === undefined
    ? { id: 'acc1', customerId: 'prof1', tierId: 'new', balanceCents: 0n }
    : opts.account;
  return {
    loyaltyRule: {
      findMany: jest.fn().mockResolvedValue(rules.map((r) => ({ event: r.event }))),
      findUnique: jest.fn(async ({ where }: any) => rules.find((r) => r.event === where.event) ?? null),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    loyaltyTier: {
      findMany: jest.fn().mockResolvedValue(tiers),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    customerProfile: {
      upsert: jest.fn().mockResolvedValue(profile),
      findUnique: jest.fn().mockResolvedValue(profile),
    },
    loyaltyAccount: {
      findUnique: jest.fn().mockResolvedValue(account),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'acc1', ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...account, balanceCents: 20n })),
    },
    loyaltyTransaction: {
      findFirst: jest.fn().mockResolvedValue(opts.dupTxn ?? null),
      findMany: jest.fn().mockResolvedValue(
        opts.txns ?? [{ deltaCents: 20n }, { deltaCents: 5n }],
      ),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'lt1', ...data })),
      count: jest.fn().mockResolvedValue(2),
    },
    reward: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => fn({})),
  } as any;
}

function svc(db?: any) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return { service: new LoyaltyService(db ?? makeDb(), audit), audit };
}

describe('LoyaltyService', () => {
  describe('earn', () => {
    it('awards rule-based points with a ledger row (never overwrites balance)', async () => {
      const db = makeDb();
      const { service } = svc(db);

      const result: any = await service.earn(db, {
        userId: 'user1', event: 'BOOKING', refType: 'PAYMENT', refId: 'pay1',
      });

      expect(result.transaction.deltaCents).toBe(20n);
      expect(result.transaction.type).toBe('EARN_BOOKING');
      expect(db.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deltaCents: 20n, refType: 'PAYMENT', refId: 'pay1' }),
        }),
      );
      // Balance moves by increment, and tier refresh runs.
      expect(db.loyaltyAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { balanceCents: { increment: 20n } } }),
      );
    });

    it('is idempotent per (type, refType, refId)', async () => {
      const existing = { id: 'lt-old', accountId: 'acc1', type: 'EARN_BOOKING', deltaCents: 20n };
      const db = makeDb({ dupTxn: existing });
      const { service } = svc(db);

      const result: any = await service.earn(db, {
        userId: 'user1', event: 'BOOKING', refType: 'PAYMENT', refId: 'pay1',
      });

      expect(result.duplicate).toBe(true);
      expect(result.transaction.id).toBe('lt-old');
      expect(db.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('awards nothing when the rule is inactive or missing', async () => {
      const db = makeDb({ rules: [{ event: 'BOOKING', points: 20, active: false }] });
      const { service } = svc(db);

      const result = await service.earn(db, {
        userId: 'user1', event: 'BOOKING', refType: 'PAYMENT', refId: 'pay9',
      });

      expect(result).toBeNull();
      expect(db.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('creates the customer profile + account on first earn (FK-safe)', async () => {
      const db = makeDb({ profile: { id: 'prof-new', userId: 'user-new' }, account: null });
      db.loyaltyAccount.findUnique.mockResolvedValue(null);
      const { service } = svc(db);

      await service.earn(db, {
        userId: 'user-new', event: 'SIGNUP', refType: 'USER', refId: 'user-new',
      });

      expect(db.customerProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-new' } }),
      );
      expect(db.loyaltyAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ customerId: 'prof-new' }) }),
      );
    });

    it('promotes tiers on lifetime earned points', async () => {
      // Lifetime 20 + 5 + 500 = 525 → SILVER.
      const db = makeDb({ txns: [{ deltaCents: 20n }, { deltaCents: 5n }, { deltaCents: 500n }] });
      const { service } = svc(db);

      const result: any = await service.earn(db, {
        userId: 'user1', event: 'BOOKING', refType: 'PAYMENT', refId: 'pay2',
      });

      expect(result.tier.id).toBe('silver');
      expect(db.loyaltyAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'acc1' }, data: { tierId: 'silver' } }),
      );
    });

    it('never demotes on redemption (lifetime ignores REDEEM)', async () => {
      const db = makeDb({
        txns: [{ deltaCents: 600n }, { deltaCents: -200n }],
        account: { id: 'acc1', customerId: 'prof1', tierId: 'silver', balanceCents: 400n },
      });
      // findMany for refreshTier filters type != REDEEM at query level in prod;
      // emulate post-filter lifetime 600 → SILVER retained.
      db.loyaltyTransaction.findMany.mockResolvedValue([{ deltaCents: 600n }]);
      const { service } = svc(db);

      const tier: any = await service.refreshTier(db, 'acc1');
      expect(tier.id).toBe('silver');
    });
  });

  describe('redeem', () => {
    it('debits balance atomically and issues a voucher with ledger row', async () => {
      const account = { id: 'acc1', customerId: 'prof1', tierId: 'silver', balanceCents: 400n };
      const reward = { id: 'rwd1', name: 'KES 200 Off', costCents: 200n, active: true };
      const tx: any = {
        reward: { findUnique: jest.fn().mockResolvedValue(reward) },
        customerProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'prof1' }) },
        loyaltyAccount: {
          findUnique: jest.fn().mockResolvedValue(account),
          update: jest.fn().mockResolvedValue({ ...account, balanceCents: 200n }),
        },
        loyaltyTransaction: {
          create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'lt-r', ...data })),
        },
      };
      const db: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
      const { service } = svc(db);
      (service as any).prisma = db;

      const result: any = await service.redeem('user1', 'rwd1');

      expect(result.voucher).toMatch(/^RWD-/);
      expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'REDEEM', deltaCents: -200n, refType: 'REWARD', refId: 'rwd1' }),
        }),
      );
      expect(tx.loyaltyAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { balanceCents: { decrement: 200n } } }),
      );
    });

    it('rejects redemption with insufficient points', async () => {
      const tx: any = {
        reward: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', name: 'Big', costCents: 1000n, active: true }) },
        customerProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'prof1' }) },
        loyaltyAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'acc1', balanceCents: 10n }) },
        loyaltyTransaction: { create: jest.fn() },
      };
      const db: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
      const { service } = svc(db);
      (service as any).prisma = db;

      await expect(service.redeem('user1', 'r1')).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it('rejects inactive rewards', async () => {
      const tx: any = {
        reward: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', active: false }) },
      };
      const db: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
      const { service } = svc(db);
      (service as any).prisma = db;

      await expect(service.redeem('user1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('admin', () => {
    it('updates rules (audited) and seeds defaults without clobbering', async () => {
      const db = makeDb();
      db.loyaltyRule.upsert = jest.fn().mockResolvedValue({ event: 'BOOKING', points: 30, active: true });
      const { service, audit } = svc(db);

      const updated = await service.updateRule('admin1', { event: 'BOOKING', points: 30, active: true });
      expect(updated.points).toBe(30);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'loyaltyRule.update' }));

      // Seeding skips existing events.
      const db2 = makeDb();
      const { service: s2 } = svc(db2);
      await s2.ensureSeeded(db2);
      expect(db2.loyaltyRule.create).not.toHaveBeenCalled();
    });
  });
});
