import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

function makePrisma(opts: {
  templates?: any[];
  notifications?: any[];
  user?: any;
  row?: any;
} = {}) {
  const templates = opts.templates ?? [
    { key: 'BOOKING_CREATED:INAPP', event: 'BOOKING_CREATED', channel: 'INAPP', subject: null, body: 'Hi {{customerName}}, booking {{reference}} received.' },
    { key: 'BOOKING_CREATED:EMAIL', event: 'BOOKING_CREATED', channel: 'EMAIL', subject: 'Booking {{reference}}', body: 'Hi {{customerName}}, amount {{amount}}.' },
  ];
  const created: any[] = [];
  return {
    notificationTemplate: {
      findMany: jest.fn(async (args?: any) => {
        if (args?.select) return templates.map((t) => ({ key: t.key }));
        if (args?.where) return templates.filter((t) => (!args.where.event || t.event === args.where.event) && (args.where.active === undefined || true));
        return templates;
      }),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    notification: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: `n${created.length + 1}`, read: false, attempts: 0, createdAt: new Date(), ...data };
        created.push(row);
        return row;
      }),
      findUnique: jest.fn().mockResolvedValue(opts.row ?? null),
      findMany: jest.fn().mockResolvedValue(opts.notifications ?? []),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...(opts.row ?? {}), ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(opts.user ?? { email: 'c@example.com', phone: '+254700000000' }),
    },
    __created: created,
  } as any;
}

function svc(prisma?: any, queue?: any, provider?: any) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const q = queue ?? { add: jest.fn().mockResolvedValue(true) };
  const p = provider ?? { send: jest.fn().mockResolvedValue({ delivered: true, providerRef: 'x1' }) };
  return { service: new NotificationsService(prisma ?? makePrisma(), audit, q, p), audit, queue: q, provider: p };
}

describe('NotificationsService', () => {
  describe('render', () => {
    it('substitutes placeholders and blanks unknown variables', () => {
      const { service } = svc();
      expect(service.render('Hi {{customerName}}, ref {{reference}}.', { customerName: 'Ama', reference: 'SVN-1' }))
        .toBe('Hi Ama, ref SVN-1.');
      expect(service.render('Hello {{missing}}!', {})).toBe('Hello !');
    });
  });

  describe('notify', () => {
    it('persists INAPP immediately and queues external channels', async () => {
      const prisma = makePrisma();
      const { service, queue } = svc(prisma);

      const out = await service.notify('BOOKING_CREATED', {
        userId: 'u1',
        data: { customerName: 'Ama', reference: 'SVN-1', amount: 'KES 2,000.00' },
      });

      expect(out).toHaveLength(2);
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ channel: 'INAPP', status: 'SENT' }) }),
      );
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: 'EMAIL',
            status: 'PENDING',
            subject: 'Booking SVN-1',
            body: 'Hi Ama, amount KES 2,000.00.',
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith('notification.send', expect.objectContaining({ notificationId: expect.any(String) }));
    });

    it('falls back to synchronous delivery when the queue is down', async () => {
      const prisma = makePrisma({
        row: { id: 'n1', userId: 'u1', channel: 'EMAIL', subject: 's', body: 'b', status: 'PENDING', templateKey: 'k' },
      });
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n9', userId: 'u1', channel: 'EMAIL', subject: 's', body: 'b', status: 'PENDING', templateKey: 'k',
      });
      const queue = { add: jest.fn().mockResolvedValue(false) };
      const provider = { send: jest.fn().mockResolvedValue({ delivered: true }) };
      const { service } = svc(prisma, queue, provider);

      const out = await service.notify('BOOKING_CREATED', { userId: 'u1', data: {} });

      const email = out.find((o) => o.channel === 'EMAIL')!;
      expect(email.status).toBe('SENT');
      expect(provider.send).toHaveBeenCalled();
    });

    it('returns [] for events without templates', async () => {
      const { service } = svc();
      await expect(service.notify('NOPE_UNKNOWN', { userId: 'u1' })).resolves.toEqual([]);
    });

    it('never throws — communication must not break business flows', async () => {
      const prisma = makePrisma();
      prisma.notificationTemplate.findMany.mockRejectedValue(new Error('db down'));
      const { service } = svc(prisma);
      await expect(service.notify('BOOKING_CREATED', { userId: 'u1' })).resolves.toEqual([]);
    });
  });

  describe('sendNow (retry behaviour)', () => {
    it('marks SENT on provider success', async () => {
      const row = { id: 'n1', userId: 'u1', channel: 'EMAIL', subject: 's', body: 'b', status: 'PENDING', templateKey: 'k' };
      const prisma = makePrisma({ row });
      const { service, provider } = svc(prisma);

      await service.sendNow('n1', { throwOnFailure: true });

      expect(provider.send).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'EMAIL', to: 'c@example.com', body: 'b' }),
      );
      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
      );
    });

    it('records FAILED without throwing in sync fallback mode', async () => {
      const row = { id: 'n1', userId: 'u1', channel: 'SMS', subject: null, body: 'b', status: 'PENDING', templateKey: 'k' };
      const prisma = makePrisma({ row, user: { email: 'c@example.com', phone: null } });
      const { service } = svc(prisma);

      await service.sendNow('n1'); // no throw

      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('throws for the worker so BullMQ retries with backoff', async () => {
      const row = { id: 'n1', userId: 'u1', channel: 'EMAIL', subject: 's', body: 'b', status: 'PENDING', templateKey: 'k' };
      const prisma = makePrisma({ row });
      const provider = { send: jest.fn().mockRejectedValue(new Error('gateway 502')) };
      const { service } = svc(prisma, undefined, provider);

      await expect(service.sendNow('n1', { throwOnFailure: true })).rejects.toThrow('gateway 502');
      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('skips already-sent rows (worker redelivery safe)', async () => {
      const prisma = makePrisma({
        row: { id: 'n1', userId: 'u1', channel: 'EMAIL', body: 'b', status: 'SENT' },
      });
      const { service, provider } = svc(prisma);

      await service.sendNow('n1', { throwOnFailure: true });
      expect(provider.send).not.toHaveBeenCalled();
    });
  });

  describe('inbox', () => {
    it('blocks reading another user’s notification', async () => {
      const prisma = makePrisma({ row: { id: 'n1', userId: 'u-other' } });
      const { service } = svc(prisma);
      await expect(service.markRead('u1', 'n1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s unknown notifications', async () => {
      const prisma = makePrisma({ row: null });
      const { service } = svc(prisma);
      await expect(service.markRead('u1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('templates (no hard-coded content)', () => {
    it('upserts by EVENT:CHANNEL key and audits', async () => {
      const prisma = makePrisma();
      prisma.notificationTemplate.upsert.mockResolvedValue({ id: 't1', key: 'PROMOTION:SMS', active: true });
      const { service, audit } = svc(prisma);

      const tpl = await service.upsertTemplate('admin1', {
        event: 'promotion', channel: 'SMS', body: 'Deal: {{promoCode}}!',
      } as any);

      expect(prisma.notificationTemplate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: 'PROMOTION:SMS' } }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'notificationTemplate.upsert' }),
      );
      expect(tpl.key).toBe('PROMOTION:SMS');
    });
  });
});
