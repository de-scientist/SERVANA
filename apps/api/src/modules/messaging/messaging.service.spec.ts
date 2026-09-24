import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagingService } from './messaging.service';

function makePrisma(opts: {
  booking?: any;
  profile?: any;
  conversation?: any;
  conversations?: any[];
  messages?: any[];
  message?: any;
  report?: any;
} = {}) {
  return {
    booking: {
      findUnique: jest.fn().mockResolvedValue(opts.booking === undefined ? { id: 'b1', customerId: 'cust1', providerId: 'prof1' } : opts.booking),
    },
    providerProfile: {
      findUnique: jest.fn().mockResolvedValue(opts.profile === undefined ? { userId: 'user-prov' } : opts.profile),
    },
    conversation: {
      findUnique: jest.fn().mockResolvedValue(opts.conversation ?? null),
      findFirst: jest.fn().mockResolvedValue(opts.conversation ?? null),
      findMany: jest.fn().mockResolvedValue(opts.conversations ?? []),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'conv1', createdAt: new Date(), ...data })),
    },
    message: {
      findUnique: jest.fn().mockResolvedValue(opts.message ?? null),
      findMany: jest.fn().mockResolvedValue(opts.messages ?? []),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'm1', read: false, createdAt: new Date(), ...data })),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockImplementation(async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return ids.map((id) => ({ id, name: id === 'cust1' ? 'Ama' : 'Zuri Studio' }));
      }),
    },
    conversationReport: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'rep1', status: 'OPEN', ...data })),
      findUnique: jest.fn().mockResolvedValue(opts.report ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    },
  } as any;
}

function svc(prisma?: any) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return { service: new MessagingService(prisma ?? makePrisma(), audit), audit };
}

const CONV = { id: 'conv1', bookingId: 'b1', participantIds: ['cust1', 'user-prov'], createdAt: new Date() };

describe('MessagingService', () => {
  describe('openThread', () => {
    it('creates exactly one thread per booking for either party', async () => {
      const prisma = makePrisma({ conversation: null });
      const { service, audit } = svc(prisma);

      const asCustomer = await service.openThread({ sub: 'cust1', role: 'CUSTOMER' }, 'b1');
      expect(asCustomer.id).toBe('conv1');
      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookingId: 'b1', participantIds: ['cust1', 'user-prov'] }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'conversation.open' }));

      const prisma2 = makePrisma({ conversation: CONV });
      const { service: s2 } = svc(prisma2);
      const asProvider = await s2.openThread({ sub: 'user-prov', role: 'PROVIDER' }, 'b1');
      expect(asProvider.id).toBe('conv1');
      expect(prisma2.conversation.create).not.toHaveBeenCalled();
    });

    it('blocks outsiders from opening threads', async () => {
      const { service } = svc();
      await expect(service.openThread({ sub: 'stranger', role: 'CUSTOMER' }, 'b1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('404s unknown bookings', async () => {
      const { service } = svc(makePrisma({ booking: null }));
      await expect(service.openThread({ sub: 'cust1', role: 'CUSTOMER' }, 'b1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('send + read', () => {
    it('lets participants exchange text with display names only', async () => {
      const prisma = makePrisma({ conversation: CONV });
      const { service } = svc(prisma);

      const msg: any = await service.send({ sub: 'cust1', role: 'CUSTOMER' }, 'conv1', 'Hello, what time?');
      expect(msg.body).toBe('Hello, what time?');
      expect(msg.senderName).toBe('Ama');
      expect(msg).not.toHaveProperty('email');
      expect(msg).not.toHaveProperty('phone');
    });

    it('blocks non-participants from sending or reading', async () => {
      const prisma = makePrisma({ conversation: CONV });
      const { service } = svc(prisma);

      await expect(service.send({ sub: 'stranger', role: 'CUSTOMER' }, 'conv1', 'hi')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.getMessages({ sub: 'stranger', role: 'CUSTOMER' }, 'conv1', {} as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lets only the recipient mark a message read', async () => {
      const msg = { id: 'm1', conversationId: 'conv1', senderId: 'cust1', body: 'hi', read: false };
      const prisma = makePrisma({ conversation: CONV, message: msg });
      const { service } = svc(prisma);

      const ok = await service.markRead({ sub: 'user-prov', role: 'PROVIDER' }, 'm1');
      expect(ok.read).toBe(true);

      await expect(service.markRead({ sub: 'cust1', role: 'CUSTOMER' }, 'm1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('report + admin', () => {
    it('lets participants report threads', async () => {
      const prisma = makePrisma({ conversation: CONV });
      const { service, audit } = svc(prisma);

      const rep = await service.report({ sub: 'cust1', role: 'CUSTOMER' }, 'conv1', 'Abusive language used here');
      expect(rep.status).toBe('OPEN');
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'conversation.report' }));
    });

    it('lets admins review reports with audit, blocks customers', async () => {
      const prisma = makePrisma({ report: { id: 'rep1', status: 'OPEN' } });
      prisma.conversationReport.update.mockResolvedValue({ id: 'rep1', status: 'ACTIONED' });
      const { service, audit } = svc(prisma);

      const out = await service.reviewReport({ sub: 'admin1', role: 'ADMIN' }, 'rep1', { status: 'ACTIONED' } as any);
      expect(out.status).toBe('ACTIONED');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversationReport.review' }),
      );

      await expect(
        service.reviewReport({ sub: 'cust1', role: 'CUSTOMER' }, 'rep1', { status: 'DISMISSED' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
