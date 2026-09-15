import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommissionService } from './commission.service';

function makePrisma() {
  return {
    commissionRule: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
}

describe('CommissionService', () => {
  describe('compute', () => {
    it('returns 0 commission when no rules exist', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([]);
      const svc = new CommissionService(prisma);

      const result = await svc.compute(200000n, {});

      expect(result.commissionCents).toBe(0n);
      expect(result.rateBasisPoints).toBe(0);
      expect(result.fixedCents).toBe(0n);
    });

    it('applies standard percentage rule (10%)', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([
        { id: 'standard', scope: 'standard', type: 'PERCENTAGE', value: 1000n, priority: 0 },
      ]);
      const svc = new CommissionService(prisma);

      // KSh 2,000 = 200000 cents, 10% = 20000 cents
      const result = await svc.compute(200000n, {});

      expect(result.rateBasisPoints).toBe(1000);
      expect(result.commissionCents).toBe(20000n);
    });

    it('applies fixed commission rule', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([
        { id: 'fixed_1', scope: 'standard', type: 'FIXED', value: 500n, priority: 0 },
      ]);
      const svc = new CommissionService(prisma);

      const result = await svc.compute(200000n, {});

      expect(result.fixedCents).toBe(500n);
      expect(result.commissionCents).toBe(500n);
    });

    it('combines percentage and fixed rules', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([
        { id: 'standard', scope: 'standard', type: 'PERCENTAGE', value: 1000n, priority: 0 },
        { id: 'fixed_fee', scope: 'standard', type: 'FIXED', value: 100n, priority: 0 },
      ]);
      const svc = new CommissionService(prisma);

      // 10% of 200000 = 20000 + 100 fixed = 20100
      const result = await svc.compute(200000n, {});

      expect(result.commissionCents).toBe(20100n);
    });

    it('category-specific rule overrides standard percentage', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([
        { id: 'standard', scope: 'standard', type: 'PERCENTAGE', value: 1000n, priority: 0 },
        { id: 'cat_hair', scope: 'category:hair-123', type: 'PERCENTAGE', value: 1500n, priority: 10 },
      ]);
      const svc = new CommissionService(prisma);

      // Higher-priority category rule wins: 15% of 200000 = 30000
      const result = await svc.compute(200000n, { categoryId: 'hair-123' });

      expect(result.rateBasisPoints).toBe(1500);
      expect(result.commissionCents).toBe(30000n);
    });

    it('provider-specific rule overrides standard percentage', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([
        { id: 'standard', scope: 'standard', type: 'PERCENTAGE', value: 1000n, priority: 0 },
        { id: 'prov_abc', scope: 'provider:prov-abc', type: 'PERCENTAGE', value: 500n, priority: 10 },
      ]);
      const svc = new CommissionService(prisma);

      // Provider override: 5% of 200000 = 10000
      const result = await svc.compute(200000n, { providerId: 'prov-abc' });

      expect(result.rateBasisPoints).toBe(500);
      expect(result.commissionCents).toBe(10000n);
    });

    it('caps commission at gross amount', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([
        { id: 'standard', scope: 'standard', type: 'PERCENTAGE', value: 10000n, priority: 0 },
      ]);
      const svc = new CommissionService(prisma);

      // 100% of 200000 = 200000, but adding fixed would exceed gross
      const result = await svc.compute(200000n, {});

      expect(result.commissionCents).toBe(200000n);
    });

    it('does not produce negative commission', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([]);
      const svc = new CommissionService(prisma);

      const result = await svc.compute(100n, {});
      expect(result.commissionCents).toBe(0n);
    });

    it('builds an auditable rule snapshot', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([
        { id: 'standard', scope: 'standard', type: 'PERCENTAGE', value: 1000n, priority: 0 },
      ]);
      const svc = new CommissionService(prisma);

      const result = await svc.compute(200000n, {});

      expect(result.ruleSnapshot).toHaveLength(1);
      expect(result.ruleSnapshot[0]).toEqual({
        id: 'standard',
        scope: 'standard',
        type: 'PERCENTAGE',
        value: 1000n,
        priority: 0,
      });
    });

    it('queries only valid (non-expired) rules', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([]);
      const svc = new CommissionService(prisma);

      await svc.compute(200000n, { providerId: 'prov-x' });

      const whereArg = prisma.commissionRule.findMany.mock.calls[0][0].where;
      expect(whereArg.scope.in).toContain('standard');
      expect(whereArg.scope.in).toContain('provider:prov-x');
      expect(whereArg.validFrom.lte).toBeInstanceOf(Date);
    });
  });

  describe('rule management', () => {
    it('lists all rules', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findMany.mockResolvedValue([
        { id: 'standard', scope: 'standard', type: 'PERCENTAGE', value: 1000n, priority: 0, validFrom: new Date(), validTo: null },
      ]);
      const svc = new CommissionService(prisma);

      const rules = await svc.listRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].value).toBe('1000');
    });

    it('gets a rule by id', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findUnique.mockResolvedValue({
        id: 'standard', scope: 'standard', type: 'PERCENTAGE', value: 1000n, priority: 0, validFrom: new Date(), validTo: null,
      });
      const svc = new CommissionService(prisma);

      const rule = await svc.getRule('standard');
      expect(rule.value).toBe('1000');
    });

    it('throws NotFoundException for missing rule', async () => {
      const prisma = makePrisma();
      const svc = new CommissionService(prisma);

      await expect(svc.getRule('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a new percentage rule', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findFirst.mockResolvedValue(null);
      prisma.commissionRule.create.mockResolvedValue({
        id: 'cat_123', scope: 'category:hair', type: 'PERCENTAGE', value: 1500n, priority: 10, validFrom: new Date(), validTo: null,
      });
      const svc = new CommissionService(prisma);

      const rule = await svc.createRule({ scope: 'category:hair', type: 'PERCENTAGE', value: 1500, priority: 10 });
      expect(rule.value).toBe('1500');
      expect(prisma.commissionRule.create).toHaveBeenCalled();
    });

    it('creates a new fixed rule', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findFirst.mockResolvedValue(null);
      prisma.commissionRule.create.mockResolvedValue({
        id: 'fixed_1', scope: 'provider:abc', type: 'FIXED', value: 500n, priority: 0, validFrom: new Date(), validTo: null,
      });
      const svc = new CommissionService(prisma);

      const rule = await svc.createRule({ scope: 'provider:abc', type: 'FIXED', value: 500 });
      expect(rule.value).toBe('500');
    });

    it('rejects percentage value > 10000 basis points', async () => {
      const prisma = makePrisma();
      const svc = new CommissionService(prisma);

      await expect(svc.createRule({ scope: 'category:x', type: 'PERCENTAGE', value: 10001 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects negative fixed value', async () => {
      const prisma = makePrisma();
      const svc = new CommissionService(prisma);

      await expect(svc.createRule({ scope: 'provider:x', type: 'FIXED', value: -100 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('prevents duplicate standard rule', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findFirst.mockResolvedValue({ id: 'standard' });
      const svc = new CommissionService(prisma);

      await expect(svc.createRule({ scope: 'standard', type: 'PERCENTAGE', value: 1000 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates a rule', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findUnique.mockResolvedValue({
        id: 'cat_1', scope: 'category:hair', type: 'PERCENTAGE', value: 1000n, priority: 0, validFrom: new Date(), validTo: null,
      });
      prisma.commissionRule.update.mockResolvedValue({
        id: 'cat_1', scope: 'category:hair', type: 'PERCENTAGE', value: 2000n, priority: 5, validFrom: new Date(), validTo: null,
      });
      const svc = new CommissionService(prisma);

      const rule = await svc.updateRule('cat_1', { value: 2000, priority: 5 });
      expect(rule.value).toBe('2000');
    });

    it('prevents modification of standard rule', async () => {
      const prisma = makePrisma();
      const svc = new CommissionService(prisma);

      await expect(svc.updateRule('standard', { value: 2000 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes a non-standard rule', async () => {
      const prisma = makePrisma();
      prisma.commissionRule.findUnique.mockResolvedValue({
        id: 'cat_1', scope: 'category:hair', type: 'PERCENTAGE', value: 1000n, priority: 0, validFrom: new Date(), validTo: null,
      });
      const svc = new CommissionService(prisma);

      const result = await svc.deleteRule('cat_1');
      expect(result.deleted).toBe(true);
      expect(prisma.commissionRule.delete).toHaveBeenCalledWith({ where: { id: 'cat_1' } });
    });

    it('prevents deletion of standard rule', async () => {
      const prisma = makePrisma();
      const svc = new CommissionService(prisma);

      await expect(svc.deleteRule('standard')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when deleting nonexistent rule', async () => {
      const prisma = makePrisma();
      const svc = new CommissionService(prisma);

      await expect(svc.deleteRule('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
