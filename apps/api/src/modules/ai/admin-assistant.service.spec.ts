import { AdminAssistantService } from './admin-assistant.service';

function makePrisma(opts: {
  bookings?: any[];
  categories?: any[];
  providers?: any[];
  commissions?: any[];
  payments?: any[];
  refunds?: any[];
} = {}) {
  return {
    booking: {
      findMany: jest.fn().mockResolvedValue(opts.bookings ?? []),
    },
    category: {
      findMany: jest.fn().mockResolvedValue(opts.categories ?? []),
    },
    providerProfile: {
      findMany: jest.fn().mockResolvedValue(opts.providers ?? []),
    },
    commission: {
      findMany: jest.fn().mockResolvedValue(opts.commissions ?? []),
    },
    payment: {
      findMany: jest.fn().mockResolvedValue(opts.payments ?? []),
    },
    refund: {
      findMany: jest.fn().mockResolvedValue(opts.refunds ?? []),
    },
  } as any;
}

function svc(prisma?: any) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const ai = {} as any;
  return { service: new AdminAssistantService(prisma ?? makePrisma(), audit, ai), audit };
}

describe('AdminAssistantService (controlled analytics)', () => {
  it('explains booking declines with current-vs-previous counts', async () => {
    const prisma = makePrisma();
    prisma.booking.findMany
      .mockResolvedValueOnce(Array.from({ length: 10 }, () => ({ status: 'COMPLETED' })))
      .mockResolvedValueOnce(Array.from({ length: 20 }, () => ({ status: 'COMPLETED' })));
    const { service } = svc(prisma);

    const out = await service.ask('admin1', 'Why did bookings decline this month?');
    expect(out.answer).toMatch(/declined 50%/);
    expect(out.data).toMatchObject({ deltaPct: -50 });
  });

  it('names the fastest-growing category', async () => {
    const prisma = makePrisma({
      categories: [
        { id: 'c1', name: 'Hair' },
        { id: 'c2', name: 'Nails' },
      ],
    });
    const hair = { providerService: { categoryId: 'c1' } };
    const nails = { providerService: { categoryId: 'c2' } };
    prisma.booking.findMany
      .mockResolvedValueOnce([...Array.from({ length: 8 }, () => hair), nails])
      .mockResolvedValueOnce([...Array.from({ length: 2 }, () => hair), ...Array.from({ length: 5 }, () => nails)]);
    const { service } = svc(prisma);

    const out = await service.ask('admin1', 'Which category is growing fastest?');
    expect(out.answer).toMatch(/Hair/);
  });

  it('ranks providers by cancellation rate with a noise floor', async () => {
    const prisma = makePrisma({
      bookings: [
        ...Array.from({ length: 3 }, () => ({ providerId: 'p-bad', status: 'CANCELLED' })),
        { providerId: 'p-bad', status: 'COMPLETED' },
        ...Array.from({ length: 5 }, () => ({ providerId: 'p-ok', status: 'COMPLETED' })),
        { providerId: 'p-tiny', status: 'CANCELLED' },
      ],
      providers: [
        { id: 'p-bad', businessName: 'Flaky Studio' },
        { id: 'p-ok', businessName: 'Solid Studio' },
        { id: 'p-tiny', businessName: 'New Studio' },
      ],
    });
    const { service } = svc(prisma);

    const out = await service.ask('admin1', 'Which providers have high cancellation rates?');
    const rows = (out.data as any).rows;
    expect(rows[0].providerId).toBe('p-bad');
    expect(rows[0].rate).toBe(0.75);
    // Single-booking provider excluded by the 3-booking noise floor.
    expect(rows.some((r: any) => r.providerId === 'p-tiny')).toBe(false);
  });

  it('attributes commission to top sources', async () => {
    const prisma = makePrisma({
      commissions: [
        { commissionCents: 20000n, payment: { providerId: 'p1' } },
        { commissionCents: 5000n, payment: { providerId: 'p2' } },
      ],
    });
    const { service } = svc(prisma);

    const out = await service.ask('admin1', 'What generated the most commission?');
    expect((out.data as any).rows[0].providerId).toBe('p1');
    expect((out.data as any).totalCents).toBe('25000');
  });

  it('spots demand pressure by city', async () => {
    const prisma = makePrisma({
      providers: [
        { id: 'p1', city: 'Nairobi' },
        { id: 'p2', city: 'Nakuru' },
        { id: 'p3', city: 'Nakuru' },
      ],
      bookings: [
        ...Array.from({ length: 10 }, () => ({ providerId: 'p1' })),
        { providerId: 'p2' },
      ],
    });
    const { service } = svc(prisma);

    const out = await service.ask('admin1', 'Which areas have high demand and few providers?');
    expect(out.answer).toMatch(/Nairobi/);
  });

  it('answers revenue questions from ledger tables', async () => {
    const prisma = makePrisma({
      payments: [{ grossCents: 200000n, commissionCents: 20000n }],
      refunds: [{ amountCents: 0n }],
    });
    const { service } = svc(prisma);

    const out = await service.ask('admin1', 'How much revenue this month?');
    expect(out.answer).toMatch(/2000/);
  });

  it('guides unknown questions and audits every ask', async () => {
    const { service, audit } = svc();
    const out = await service.ask('admin1', 'What is the meaning of life?');
    expect(out.answer).toMatch(/booking trends/);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai.adminAsk' }));
  });
});
