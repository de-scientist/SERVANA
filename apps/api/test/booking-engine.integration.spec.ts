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
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(30000);

describe('Phase 5 · booking engine (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
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

  async function verifyProvider(email: string): Promise<void> {
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
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Bookable Studio', city: 'Nairobi' });
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
    return { prov, serviceId };
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

  it('creates a booking, validates price, and shows it in history views', async () => {
    const cust = await register('CUSTOMER', `cust_${Date.now()}@example.com`);
    const { serviceId } = await setupVerifiedProvider(`prov_${Date.now()}@example.com`);
    const startsAt = futureIso(0);

    const created = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: serviceId,
      startsAt,
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING');
    expect(created.body.paymentStatus).toBe('INITIATED');
    expect(created.body.priceCents).toBe('200000');
    expect(created.body.provider).toBeDefined();

    const list = await call('GET', '/bookings?view=upcoming', cust.accessToken);
    expect(list.body.data.length).toBe(1);

    const detail = await call('GET', `/bookings/${created.body.id}`, cust.accessToken);
    expect(detail.body.history.length).toBe(1);
    expect(detail.body.history[0].to).toBe('PENDING');
  });

  it('prevents double-booking under concurrent requests', async () => {
    const cust = await register('CUSTOMER', `cust2_${Date.now()}@example.com`);
    const custB = await register('CUSTOMER', `cust3_${Date.now()}@example.com`);
    const { serviceId } = await setupVerifiedProvider(`provb_${Date.now()}@example.com`);
    const startsAt = futureIso(1);

    const [a, b] = await Promise.all([
      call('POST', '/bookings', cust.accessToken, { providerServiceId: serviceId, startsAt, deliveryType: 'AT_PROVIDER_LOCATION' }),
      call('POST', '/bookings', custB.accessToken, { providerServiceId: serviceId, startsAt, deliveryType: 'AT_PROVIDER_LOCATION' }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const count = await prisma.booking.count({ where: { providerServiceId: serviceId, startsAt: new Date(startsAt) } });
    expect(count).toBe(1);
  });

  it('enforces the booking state machine and prevents invalid transitions', async () => {
    const cust = await register('CUSTOMER', `cust4_${Date.now()}@example.com`);
    const { prov, serviceId } = await setupVerifiedProvider(`provc_${Date.now()}@example.com`);
    const startsAt = futureIso(0);
    const created = await call('POST', '/bookings', cust.accessToken, { providerServiceId: serviceId, startsAt, deliveryType: 'AT_PROVIDER_LOCATION' });
    const id = created.body.id;

    // IN_PROGRESS from PENDING is invalid
    const bad = await call('PATCH', `/bookings/provider/${id}/start`, prov.accessToken);
    expect(bad.status).toBe(400);

    // Provider confirms
    const confirm = await call('PATCH', `/bookings/provider/${id}/confirm`, prov.accessToken);
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('CONFIRMED');

    // Provider completes
    const complete = await call('PATCH', `/bookings/provider/${id}/complete`, prov.accessToken);
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe('COMPLETED');

    // Cannot confirm a completed booking
    const again = await call('PATCH', `/bookings/provider/${id}/confirm`, prov.accessToken);
    expect(again.status).toBe(400);
  });

  it('records cancellation with configurable fee and financial consequences', async () => {
    const cust = await register('CUSTOMER', `cust5_${Date.now()}@example.com`);
    const provEmail = `provd_${Date.now()}@example.com`;
    const { prov, serviceId } = await setupVerifiedProvider(provEmail);
    // Strict policy: always 50% fee
    const user = await prisma.user.findUnique({ where: { email: provEmail } });
    const profile = await prisma.providerProfile.findFirst({ where: { userId: user!.id } });
    await prisma.providerProfile.update({ where: { id: profile!.id }, data: { cancellationPolicy: { freeCancelHours: 999, feePercent: 50 } } });

    const startsAt = futureIso(2);
    const created = await call('POST', '/bookings', cust.accessToken, { providerServiceId: serviceId, startsAt, deliveryType: 'AT_PROVIDER_LOCATION' });
    const id = created.body.id;

    const cancel = await call('PATCH', `/bookings/${id}/cancel`, cust.accessToken, { reason: 'Change of plans' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('CANCELLED');
    expect(cancel.body.cancelFeeCents).toBe('100000');
    expect(cancel.body.cancelledByRole).toBe('CUSTOMER');
    expect(cancel.body.cancelledAt).toBeDefined();
    expect(cancel.body.history[cancel.body.history.length - 1].to).toBe('CANCELLED');
  });

  it('enforces ownership: customers cannot act on others bookings', async () => {
    const cust = await register('CUSTOMER', `cust6_${Date.now()}@example.com`);
    const other = await register('CUSTOMER', `cust7_${Date.now()}@example.com`);
    const { serviceId } = await setupVerifiedProvider(`prove_${Date.now()}@example.com`);
    const startsAt = futureIso(3);
    const created = await call('POST', '/bookings', cust.accessToken, { providerServiceId: serviceId, startsAt, deliveryType: 'AT_PROVIDER_LOCATION' });

    const forbidden = await call('PATCH', `/bookings/${created.body.id}/cancel`, other.accessToken, { reason: 'x' });
    expect(forbidden.status).toBe(403);
  });
});
