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
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(60000);

describe('Phase 6 · payment & commission engine (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
    await prisma.payoutItem.deleteMany({});
    await prisma.payout.deleteMany({});
    await prisma.payoutMethod.deleteMany({});
    await prisma.providerEarning.deleteMany({});
    await prisma.commission.deleteMany({});
    await prisma.refund.deleteMany({});
    await prisma.paymentTransaction.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.loyaltyTransaction.deleteMany({});
    await prisma.loyaltyAccount.deleteMany({});
    await prisma.loyaltyTier.deleteMany({});
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
    await prisma.commissionRule.deleteMany({});
  }

  async function register(role: 'CUSTOMER' | 'PROVIDER', email: string) {
    const reg = await auth.register({ email, password: 'Passw0rd!23', name: 'Tester', role });
    return reg.tokens;
  }

  async function promoteAdmin(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('user missing');
    await rbac.assignRole(user.id, 'ADMIN');
    return auth.login({ email, password: 'Passw0rd!23' });
  }

  async function verifyProvider(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    const profile = await prisma.providerProfile.findFirst({ where: { userId: user!.id } });
    const adminEmail = `adminv_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    await register('CUSTOMER', adminEmail);
    const admin = await promoteAdmin(adminEmail);
    await call('POST', '/providers/me/verification/submit', (await auth.login({ email, password: 'Passw0rd!23' })).accessToken, { notes: 'verify' });
    await call('POST', `/admin/verifications/${profile!.id}/review`, admin.accessToken, { decision: 'APPROVE', level: 'PROFESSIONAL_VERIFIED' });
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

  async function setupVerifiedProvider(email: string) {
    const prov = await register('PROVIDER', email);
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Payable Studio', city: 'Nairobi' });
    const cat = await prisma.category.create({ data: { slug: 'hair-' + Date.now() + Math.random(), name: 'Hair' } });
    await call('PUT', '/providers/me/categories', prov.accessToken, { categoryIds: [cat.id] });
    const svc = await call('POST', '/providers/me/services', prov.accessToken, {
      categoryId: cat.id,
      name: 'Braids',
      price: 2000,
      durationMin: 120,
      bufferMin: 30,
      deliveryTypes: ['AT_PROVIDER_LOCATION'],
      isActive: true,
    });
    const serviceId = svc.body.data.id;
    const rules = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, startMin: 0, endMin: 1440 }));
    await call('PUT', '/providers/me/availability', prov.accessToken, { rules, exceptions: [] });
    await verifyProvider(email);
    return { prov, serviceId, catId: cat.id };
  }

  function futureIso(hourOffset = 0): string {
    const d = new Date(Date.now() + 24 * 3600_000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10 + hourOffset, 0, 0)).toISOString();
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        RbacModule,
        AuditModule,
        StorageModule,
        LoggingModule,
        NotificationModule,
        UsersModule,
        AuthModule,
        ProvidersModule,
        VerificationModule,
        AdminModule,
        AvailabilityModule,
        BookingsModule,
        PaymentsModule,
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
  }, 60000);

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  describe('payment initiation', () => {
    it('initiates payment for a pending booking', async () => {
      const cust = await register('CUSTOMER', `pcust1_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`pprov1_${Date.now()}@example.com`);
      const startsAt = futureIso(0);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt,
        deliveryType: 'AT_PROVIDER_LOCATION',
      });
      expect(booking.status).toBe(201);
      const bookingId = booking.body.data.id;

      const payment = await call('POST', '/payments', cust.accessToken, { bookingId });
      expect(payment.status).toBe(201);
      expect(payment.body.data.status).toBe('PENDING');
      expect(payment.body.data.method).toBe('OTHER');
      expect(payment.body.data.grossCents).toBe('200000');

      const updatedBooking = await call('GET', `/bookings/${bookingId}`, cust.accessToken);
      expect(updatedBooking.body.data.paymentStatus).toBe('PENDING');
    });

    it('initiates M-Pesa payment when method specified', async () => {
      const cust = await register('CUSTOMER', `pcust2_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`pprov2_${Date.now()}@example.com`);
      const startsAt = futureIso(1);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt,
        deliveryType: 'AT_PROVIDER_LOCATION',
      });
      const bookingId = booking.body.data.id;

      const payment = await call('POST', '/payments', cust.accessToken, { bookingId, method: 'MPESA' });
      expect(payment.status).toBe(201);
      expect(payment.body.data.method).toBe('MPESA');
      expect(payment.body.data.provider).toBe('mpesa');
    });

    it('rejects payment for non-existent booking', async () => {
      const cust = await register('CUSTOMER', `pcust3_${Date.now()}@example.com`);
      const payment = await call('POST', '/payments', cust.accessToken, { bookingId: '00000000-0000-0000-0000-000000000000' });
      expect(payment.status).toBe(404);
    });

    it('rejects payment for others booking', async () => {
      const cust1 = await register('CUSTOMER', `pcust4a_${Date.now()}@example.com`);
      const cust2 = await register('CUSTOMER', `pcust4b_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`pprov4_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust1.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(2),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payment = await call('POST', '/payments', cust2.accessToken, { bookingId: booking.body.data.id });
      expect(payment.status).toBe(403);
    });

    it('is idempotent: re-initiating returns existing payment', async () => {
      const cust = await register('CUSTOMER', `pcust5_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`pprov5_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(3),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });
      const bookingId = booking.body.data.id;

      const p1 = await call('POST', '/payments', cust.accessToken, { bookingId });
      const p2 = await call('POST', '/payments', cust.accessToken, { bookingId });

      expect(p1.body.data.id).toBe(p2.body.data.id);
    });
  });

  describe('webhook processing', () => {
    it('processes successful payment webhook and confirms booking', async () => {
      const cust = await register('CUSTOMER', `wcust1_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`wprov1_${Date.now()}@example.com`);
      const startsAt = futureIso(4);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt,
        deliveryType: 'AT_PROVIDER_LOCATION',
      });
      const bookingId = booking.body.data.id;

      const payRes = await call('POST', '/payments', cust.accessToken, { bookingId });
      const providerRef = payRes.body.data.providerRef;

      const webhook = await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef,
        status: 'SUCCESSFUL',
        amount: 200000,
        currency: 'KES',
      });
      expect(webhook.status).toBe(200);
      expect(webhook.body.ok).toBe(true);
      expect(webhook.body.captured).toBe(true);

      const detail = await call('GET', `/payments/${payRes.body.data.id}`, cust.accessToken);
      expect(detail.body.data.status).toBe('SUCCESSFUL');
      expect(detail.body.data.commission).toBeDefined();
      expect(Number(detail.body.data.commission.commissionCents)).toBeGreaterThan(0);
      expect(detail.body.data.transactions.length).toBeGreaterThanOrEqual(1);
    });

    it('handles duplicate webhook idempotently', async () => {
      const cust = await register('CUSTOMER', `wcust2_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`wprov2_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(5),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });
      const providerRef = payRes.body.data.providerRef;

      await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef,
        status: 'SUCCESSFUL',
        amount: 200000,
        currency: 'KES',
      });

      const duplicate = await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef,
        status: 'SUCCESSFUL',
        amount: 200000,
        currency: 'KES',
      });
      expect(duplicate.body.ok).toBe(true);
      expect(duplicate.body.duplicate).toBe(true);
    });

    it('rejects webhook with wrong amount', async () => {
      const cust = await register('CUSTOMER', `wcust3_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`wprov3_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(6),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });
      const providerRef = payRes.body.data.providerRef;

      const webhook = await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef,
        status: 'SUCCESSFUL',
        amount: 100000,
        currency: 'KES',
      });
      expect(webhook.body.amountMismatch).toBe(true);

      const detail = await call('GET', `/payments/${payRes.body.data.id}`, cust.accessToken);
      expect(detail.body.data.status).toBe('FAILED');
    });

    it('handles failed payment webhook', async () => {
      const cust = await register('CUSTOMER', `wcust4_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`wprov4_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(7),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });
      const providerRef = payRes.body.data.providerRef;

      const webhook = await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef,
        status: 'FAILED',
        amount: 200000,
        currency: 'KES',
      });
      expect(webhook.body.ok).toBe(true);
      expect(webhook.body.failed).toBe(true);

      const detail = await call('GET', `/payments/${payRes.body.data.id}`, cust.accessToken);
      expect(detail.body.data.status).toBe('FAILED');
    });

    it('rejects unknown provider webhook', async () => {
      const webhook = await call('POST', '/payments/webhook/unknown_psp', undefined, {
        providerRef: 'ref',
        status: 'SUCCESSFUL',
        amount: 100,
        currency: 'KES',
      });
      expect(webhook.body.ok).toBe(false);
    });
  });

  describe('commission calculation', () => {
    it('calculates 10% default commission on successful payment', async () => {
      const cust = await register('CUSTOMER', `ccust1_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`cprov1_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(8),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });

      await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef: payRes.body.data.providerRef,
        status: 'SUCCESSFUL',
        amount: 200000,
        currency: 'KES',
      });

      const detail = await call('GET', `/payments/${payRes.body.data.id}`, cust.accessToken);
      const commission = detail.body.data.commission;

      expect(commission.rateBasisPoints).toBe(1000);
      expect(commission.baseCents).toBe('200000');
      expect(commission.commissionCents).toBe('20000');
      expect(Number(detail.body.data.netCents)).toBe(180000);
    });

    it('creates provider earning with correct breakdown', async () => {
      const cust = await register('CUSTOMER', `ccust2_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`cprov2_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(9),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });

      await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef: payRes.body.data.providerRef,
        status: 'SUCCESSFUL',
        amount: 200000,
        currency: 'KES',
      });

      const earning = await prisma.providerEarning.findFirst({
        where: { bookingId: booking.body.data.id },
      });
      expect(earning).toBeDefined();
      expect(earning!.grossCents.toString()).toBe('200000');
      expect(earning!.commissionCents.toString()).toBe('20000');
      expect(earning!.netCents.toString()).toBe('180000');
      expect(earning!.status).toBe('AVAILABLE');
    });

    it('persists auditable commission rule snapshot', async () => {
      const cust = await register('CUSTOMER', `ccust3_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`cprov3_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(10),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });

      await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef: payRes.body.data.providerRef,
        status: 'SUCCESSFUL',
        amount: 200000,
        currency: 'KES',
      });

      const commission = await prisma.commission.findFirst({
        where: { paymentId: payRes.body.data.id },
      });
      expect(commission).toBeDefined();
      expect(commission!.ruleSnapshot).toBeDefined();
      expect(Array.isArray(commission!.ruleSnapshot)).toBe(true);
    });

    it('creates immutable payment transaction ledger entries', async () => {
      const cust = await register('CUSTOMER', `ccust4_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`cprov4_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(11),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });

      await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef: payRes.body.data.providerRef,
        status: 'SUCCESSFUL',
        amount: 200000,
        currency: 'KES',
      });

      const transactions = await prisma.paymentTransaction.findMany({
        where: { paymentId: payRes.body.data.id },
      });
      expect(transactions.length).toBeGreaterThanOrEqual(1);
      expect(transactions[0].type).toBe('CAPTURE');
      expect(transactions[0].amountCents.toString()).toBe('200000');
    });
  });

  describe('refund', () => {
    it('refunds a successful payment', async () => {
      const cust = await register('CUSTOMER', `rcust1_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`rprov1_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(12),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });

      await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef: payRes.body.data.providerRef,
        status: 'SUCCESSFUL',
        amount: 200000,
        currency: 'KES',
      });

      const refund = await call('POST', `/payments/${payRes.body.data.id}/refund`, cust.accessToken, { reason: 'Changed mind' });
      expect(refund.status).toBe(200);
      expect(refund.body.data.status).toBe('REFUNDED');

      const transactions = await prisma.paymentTransaction.findMany({
        where: { paymentId: payRes.body.data.id },
        orderBy: { createdAt: 'asc' },
      });
      const refundTx = transactions.find((t) => t.type === 'REFUND');
      expect(refundTx).toBeDefined();
      expect(refundTx!.amountCents.toString()).toBe('200000');

      const earning = await prisma.providerEarning.findFirst({
        where: { bookingId: booking.body.data.id },
      });
      expect(earning!.status).toBe('REVERSED');
    });

    it('rejects refund for non-existent payment', async () => {
      const cust = await register('CUSTOMER', `rcust2_${Date.now()}@example.com`);
      const refund = await call('POST', '/payments/00000000-0000-0000-0000-000000000000/refund', cust.accessToken);
      expect(refund.status).toBe(404);
    });

    it('rejects refund for pending payment', async () => {
      const cust = await register('CUSTOMER', `rcust3_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`rprov3_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(13),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });

      const refund = await call('POST', `/payments/${payRes.body.data.id}/refund`, cust.accessToken);
      expect(refund.status).toBe(400);
    });

    it('rejects refund for others payment', async () => {
      const cust1 = await register('CUSTOMER', `rcust4a_${Date.now()}@example.com`);
      const cust2 = await register('CUSTOMER', `rcust4b_${Date.now()}@example.com`);
      const { serviceId } = await setupVerifiedProvider(`rprov4_${Date.now()}@example.com`);

      const booking = await call('POST', '/bookings', cust1.accessToken, {
        providerServiceId: serviceId,
        startsAt: futureIso(14),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });

      const payRes = await call('POST', '/payments', cust1.accessToken, { bookingId: booking.body.data.id });

      await call('POST', '/payments/webhook/mpesa', undefined, {
        providerRef: payRes.body.data.providerRef,
        status: 'SUCCESSFUL',
        amount: 200000,
        currency: 'KES',
      });

      const refund = await call('POST', `/payments/${payRes.body.data.id}/refund`, cust2.accessToken);
      expect(refund.status).toBe(403);
    });
  });

  describe('commission rule management', () => {
    it('super admin can create and manage commission rules', async () => {
      const superAdminEmail = `superadmin_${Date.now()}@example.com`;
      const reg = await auth.register({ email: superAdminEmail, password: 'Passw0rd!23', name: 'Super Admin', role: 'SUPER_ADMIN' });

      const list = await call('GET', '/admin/commission-rules', reg.tokens.accessToken);
      expect(list.status).toBe(200);
      expect(list.body.data.length).toBeGreaterThanOrEqual(0);

      const create = await call('POST', '/admin/commission-rules', reg.tokens.accessToken, {
        scope: 'category:test-cat',
        type: 'PERCENTAGE',
        value: 1500,
        priority: 10,
      });
      expect(create.status).toBe(201);
      expect(create.body.data.value).toBe('1500');

      const get = await call('GET', `/admin/commission-rules/${create.body.data.id}`, reg.tokens.accessToken);
      expect(get.status).toBe(200);
      expect(get.body.data.scope).toBe('category:test-cat');

      const update = await call('PUT', `/admin/commission-rules/${create.body.data.id}`, reg.tokens.accessToken, {
        value: 2000,
      });
      expect(update.status).toBe(200);
      expect(update.body.data.value).toBe('2000');

      const del = await call('DELETE', `/admin/commission-rules/${create.body.data.id}`, reg.tokens.accessToken);
      expect(del.status).toBe(200);
    });

    it('non-super-admin cannot manage commission rules', async () => {
      const adminEmail = `admin_${Date.now()}@example.com`;
      await register('CUSTOMER', adminEmail);
      const admin = await promoteAdmin(adminEmail);

      const list = await call('GET', '/admin/commission-rules', admin.accessToken);
      expect(list.status).toBe(403);
    });
  });
});
