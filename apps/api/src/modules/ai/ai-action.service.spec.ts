import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AIActionService } from './ai-action.service';

function makePrisma(proposal: any = null) {
  return {
    aiActionProposal: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'prop1', ...data })),
      findUnique: jest.fn().mockResolvedValue(proposal),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...(proposal ?? { id: 'prop1' }), ...data })),
    },
    fraudAlert: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'fraud1', ...data })),
    },
  } as any;
}

function svc(prisma?: any) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return { service: new AIActionService(prisma ?? makePrisma(), audit), audit };
}

describe('AIActionService (human-confirmation gate)', () => {
  it('proposes with kind normalization and audit', async () => {
    const prisma = makePrisma();
    const { service, audit } = svc(prisma);

    const out: any = await service.propose('agent-1', {
      kind: 'refund_issue',
      payload: { paymentId: 'pay1' },
      reason: 'customer charged twice',
    });

    expect(out.status).toBe('PROPOSED');
    expect(out.sensitive).toBe(true);
    expect(prisma.aiActionProposal.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'REFUND_ISSUE' }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'aiAction.propose' }));
  });

  it('rejects malformed kinds and oversized payloads', async () => {
    const { service } = svc();
    await expect(service.propose(null, { kind: 'x', payload: {} } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.propose(null, { kind: 'REFUND_ISSUE', payload: { blob: 'x'.repeat(11_000) } } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires admin review and single transition', async () => {
    const prisma = makePrisma({ id: 'prop1', kind: 'REFUND_ISSUE', status: 'PROPOSED' });
    const { service } = svc(prisma);

    await expect(
      service.review('cust1', 'CUSTOMER', 'prop1', { decision: 'APPROVE' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const approved: any = await service.review('admin1', 'ADMIN', 'prop1', { decision: 'APPROVE' } as any);
    expect(approved.status).toBe('APPROVED');
  });

  it('REFUSES approved money actions — humans execute via admin console', async () => {
    const prisma = makePrisma({ id: 'prop1', kind: 'REFUND_ISSUE', status: 'APPROVED' });
    const { service } = svc(prisma);

    const out: any = await service.execute('admin1', 'ADMIN', 'prop1');

    expect(out.status).toBe('REFUSED');
    expect(out.note).toMatch(/human operator/i);
    expect(prisma.fraudAlert.create).not.toHaveBeenCalled();
  });

  it('REFUSES approved suspensions and deletions alike', async () => {
    for (const kind of ['USER_SUSPEND', 'ACCOUNT_DELETE', 'COMMISSION_CHANGE', 'LEDGER_ADJUST', 'PAYOUT_INITIATE']) {
      const prisma = makePrisma({ id: 'p', kind, status: 'APPROVED' });
      const { service } = svc(prisma);
      const out: any = await service.execute('admin1', 'SUPER_ADMIN', 'p');
      expect(out.status).toBe('REFUSED');
    }
  });

  it('EXECUTES only approved review flags (reversible)', async () => {
    const prisma = makePrisma({
      id: 'p', kind: 'FLAG_FOR_REVIEW', status: 'APPROVED',
      payload: { entityType: 'user', entityId: 'u9', score: 80, reason: 'odd payout pattern' },
    });
    const { service } = svc(prisma);

    const out: any = await service.execute('admin1', 'ADMIN', 'p');

    expect(out.status).toBe('EXECUTED');
    expect(out.alertId).toBe('fraud1');
    expect(prisma.fraudAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entityId: 'u9', status: 'OPEN' }) }),
    );
  });

  it('executes nothing without approval', async () => {
    const prisma = makePrisma({ id: 'p', kind: 'FLAG_FOR_REVIEW', status: 'PROPOSED', payload: {} });
    const { service } = svc(prisma);
    await expect(service.execute('admin1', 'ADMIN', 'p')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s unknown proposals', async () => {
    const { service } = svc(makePrisma(null));
    await expect(service.review('a', 'ADMIN', 'nope', { decision: 'REJECT' } as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
