import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PrismaModule } from '../src/modules/prisma/prisma.module';
import { RbacModule } from '../src/modules/rbac/rbac.module';
import { AuditModule } from '../src/modules/audit/audit.module';
import { StorageModule } from '../src/common/adapters/storage/storage.module';
import { LoggingModule } from '../src/common/logging/logging.module';
import { NotificationModule } from '../src/common/adapters/notification/notification.module';
import { UsersModule } from '../src/modules/users/users.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { ProvidersModule } from '../src/modules/providers/providers.module';
import { VerificationModule } from '../src/modules/verification/verification.module';
import { AdminModule } from '../src/modules/admin/admin.module';
import { AvailabilityModule } from '../src/modules/availability/availability.module';
import { BookingsModule } from '../src/modules/bookings/bookings.module';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { MessagingModule } from '../src/modules/messaging/messaging.module';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(90000);

/**
 * Phase 11 · notifications & messaging (integration).
 *
 * Event → template → inbox/delivery, plus booking-thread messaging with
 * read receipts, reporting and admin intervention. No REDIS_URL in test env,
 * so external channels exercise the synchronous fallback path.
 */
describe('Phase 11 · communication (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
    await prisma.conversationReport.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.conversation.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.notificationTemplate.deleteMany({});
    await prisma.paymentTransaction.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.bookingStatusHistory.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.availabilityException.deleteMany({});
    await prisma.availabilityRule.deleteMany({});
    await prisma.providerVerificationHistory.deleteMany({});
    await prisma.providerDocument.deleteMany({});
    await prisma.portfolioItem.deleteMany({});
    await prisma.providerService.deleteMany({});
    await prisma.providerCategory.deleteMany({});
    await prisma.providerVerification.deleteMany({});
    await prisma.providerProfile.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.service.deleteMany({});
  }

  async function register(role: 'CUSTOMER' | 'PROVIDER', email: string) {
    const reg = await auth.register({ email, password: 'Passw0rd!23', name: 'Tester', role });
    return reg.tokens;
  }

  async function superAdmin() {
    const reg = await auth.register({
      email: `p11admin_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      password: 'Passw0rd!23',
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
    });
    return reg.tokens;
  }

  async function call(method: string, path: string, token?: string, body?: unknown) {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(base + '/api/v1' + path, init);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  }

  function futureIso(hourOffset = 0): string {
    const d = new Date(Date.now() + 24 * 3600_000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10 + hourOffset, 0, 0)).toISOString();
  }

  async function setupProvider(email: string) {
    const prov = await register('PROVIDER', email);
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Chat Studio', city: 'Nairobi' });
    const cat = await prisma.category.create({ data: { slug: `msg-${Date.now()}${Math.random()}`, name: 'Hair' } });
    await call('PUT', '/providers/me/categories', prov.accessToken, { categoryIds: [cat.id] });
    const svc = await call('POST', '/providers/me/services', prov.accessToken, {
      categoryId: cat.id, name: 'Braids', price: 2000, durationMin: 120,
      deliveryTypes: ['AT_PROVIDER_LOCATION'], isActive: true,
    });
    const rules = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, startMin: 0, endMin: 1440 }));
    await call('PUT', '/providers/me/availability', prov.accessToken, { rules, exceptions: [] });
    // Bookings require a VERIFIED provider: submit + approve.
    const login = await auth.login({ email, password: 'Passw0rd!23' });
    await call('POST', '/providers/me/verification/submit', login.accessToken, { notes: 'verify' });
    const user = await prisma.user.findUnique({ where: { email } });
    const profile = await prisma.providerProfile.findFirst({ where: { userId: user!.id } });
    const adminEmail = `p11v_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    await register('CUSTOMER', adminEmail);
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    await rbac.assignRole(adminUser!.id, 'ADMIN');
    const admin = await auth.login({ email: adminEmail, password: 'Passw0rd!23' });
    await call('POST', `/admin/verifications/${profile!.id}/review`, admin.accessToken, {
      decision: 'APPROVE', level: 'PROFESSIONAL_VERIFIED',
    });
    return { prov, serviceId: svc.body.data.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule, RbacModule, AuditModule, StorageModule, LoggingModule, NotificationModule,
        UsersModule, AuthModule, ProvidersModule, VerificationModule, AdminModule,
        AvailabilityModule, BookingsModule, PaymentsModule, NotificationsModule, MessagingModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await app.listen(0);
    const addr = app.getHttpServer().address();
    const port = typeof addr === 'object' && addr ? addr.port : 3001;
    base = `http://localhost:${port}`;

    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    rbac = moduleRef.get(RbacService);
    await wipe();
  }, 90000);

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
    await app.close();
  }, 90000);

  describe('notification engine', () => {
    it('creates an inbox notice when a booking is created', async () => {
      const cust = await register('CUSTOMER', `p11b_${Date.now()}@example.com`);
      const { serviceId } = await setupProvider(`p11p_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId, startsAt: futureIso(0), deliveryType: 'AT_PROVIDER_LOCATION',
      });
      expect(booking.status).toBe(201);

      const inbox = await call('GET', '/notifications', cust.accessToken);
      expect(inbox.status).toBe(200);
      const bodies = inbox.body.data.map((n: any) => n.body);
      expect(bodies.some((b: string) => b.includes(booking.body.data.reference))).toBe(true);
    });

    it('supports read / unread-count / read-all', async () => {
      const cust = await register('CUSTOMER', `p11r_${Date.now()}@example.com`);
      const { serviceId } = await setupProvider(`p11pr_${Date.now()}@example.com`);
      await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId, startsAt: futureIso(1), deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const unread1 = await call('GET', '/notifications?unreadOnly=true', cust.accessToken);
      expect(unread1.body.meta.unread).toBeGreaterThanOrEqual(1);

      const firstId = unread1.body.data[0].id;
      const read = await call('PATCH', `/notifications/${firstId}/read`, cust.accessToken);
      expect(read.status).toBe(200);

      const all = await call('POST', '/notifications/read-all', cust.accessToken);
      expect(all.body.data.marked).toBeGreaterThanOrEqual(0);
      const unread2 = await call('GET', '/notifications?unreadOnly=true', cust.accessToken);
      expect(unread2.body.meta.unread).toBe(0);
    });

    it('blocks reading another user’s notifications', async () => {
      const cust1 = await register('CUSTOMER', `p11o1_${Date.now()}@example.com`);
      const cust2 = await register('CUSTOMER', `p11o2_${Date.now()}@example.com`);
      const { serviceId } = await setupProvider(`p11po_${Date.now()}@example.com`);
      await call('POST', '/bookings', cust1.accessToken, {
        providerServiceId: serviceId, startsAt: futureIso(2), deliveryType: 'AT_PROVIDER_LOCATION',
      });
      const inbox = await call('GET', '/notifications', cust1.accessToken);
      const otherId = inbox.body.data[0].id;

      const res = await call('PATCH', `/notifications/${otherId}/read`, cust2.accessToken);
      expect(res.status).toBe(403);
    });

    it('admins manage templates without deploys', async () => {
      const admin = await superAdmin();
      const list = await call('GET', '/admin/notification-templates', admin.accessToken);
      expect(list.status).toBe(200);
      expect(list.body.data.length).toBeGreaterThanOrEqual(10);

      const upsert = await call('POST', '/admin/notification-templates', admin.accessToken, {
        event: 'BOOKING_CREATED', channel: 'SMS', body: 'SERVANA: booking {{reference}} received.',
      });
      expect(upsert.status).toBe(201);
      expect(upsert.body.data.key).toBe('BOOKING_CREATED:SMS');
    });
  });

  describe('messaging', () => {
    it('opens one thread per booking and exchanges messages with receipts', async () => {
      const cust = await register('CUSTOMER', `p11m_${Date.now()}@example.com`);
      const { prov, serviceId } = await setupProvider(`p11mp_${Date.now()}@example.com`);
      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId, startsAt: futureIso(3), deliveryType: 'AT_PROVIDER_LOCATION',
      });
      const bookingId = booking.body.data.id;

      const t1 = await call('POST', '/conversations', cust.accessToken, { bookingId });
      expect(t1.status).toBe(201);
      const t2 = await call('POST', '/conversations', prov.accessToken, { bookingId });
      expect(t2.body.data.id).toBe(t1.body.data.id);
      const convId = t1.body.data.id;

      const sent = await call('POST', `/conversations/${convId}/messages`, cust.accessToken, {
        body: 'Hello, is parking available nearby?',
      });
      expect(sent.status).toBe(201);
      expect(sent.body.data.senderName).toBeDefined();
      expect(sent.body.data.body).not.toMatch(/@example\.com/);

      const read = await call('PATCH', `/messages/${sent.body.data.id}/read`, prov.accessToken);
      expect(read.body.data.read).toBe(true);

      const thread = await call('GET', `/conversations/${convId}/messages`, prov.accessToken);
      expect(thread.body.data[0].read).toBe(true);
    });

    it('blocks outsiders and self-reads', async () => {
      const cust = await register('CUSTOMER', `p11x_${Date.now()}@example.com`);
      const other = await register('CUSTOMER', `p11y_${Date.now()}@example.com`);
      const { serviceId } = await setupProvider(`p11xp_${Date.now()}@example.com`);
      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId, startsAt: futureIso(4), deliveryType: 'AT_PROVIDER_LOCATION',
      });
      const t = await call('POST', '/conversations', cust.accessToken, { bookingId: booking.body.data.id });

      const blocked = await call('POST', `/conversations/${t.body.data.id}/messages`, other.accessToken, { body: 'hijack' });
      expect(blocked.status).toBe(403);

      const mine = await call('POST', `/conversations/${t.body.data.id}/messages`, cust.accessToken, { body: 'my note' });
      const selfRead = await call('PATCH', `/messages/${mine.body.data.id}/read`, cust.accessToken);
      expect(selfRead.status).toBe(400);
    });

    it('supports reporting and admin intervention', async () => {
      const admin = await superAdmin();
      const cust = await register('CUSTOMER', `p11z_${Date.now()}@example.com`);
      const { serviceId } = await setupProvider(`p11zp_${Date.now()}@example.com`);
      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId, startsAt: futureIso(5), deliveryType: 'AT_PROVIDER_LOCATION',
      });
      const t = await call('POST', '/conversations', cust.accessToken, { bookingId: booking.body.data.id });

      const rep = await call('POST', `/conversations/${t.body.data.id}/report`, cust.accessToken, {
        reason: 'Provider keeps asking for my phone number',
      });
      expect(rep.status).toBe(201);

      const reports = await call('GET', '/admin/conversation-reports?status=OPEN', admin.accessToken);
      expect(reports.body.data.map((r: any) => r.id)).toContain(rep.body.data.id);

      const review = await call('PATCH', `/admin/conversation-reports/${rep.body.data.id}`, admin.accessToken, {
        status: 'ACTIONED', note: 'Warned provider about contact policy',
      });
      expect(review.body.data.status).toBe('ACTIONED');

      const view = await call('GET', `/admin/conversations/${t.body.data.id}/messages`, admin.accessToken);
      expect(view.status).toBe(200);
    });
  });
});
