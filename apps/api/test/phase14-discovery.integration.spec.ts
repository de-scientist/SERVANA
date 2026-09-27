import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PrismaModule } from '../src/modules/prisma/prisma.module';
import { QueueModule } from '../src/modules/queue/queue.module';
import { RbacModule } from '../src/modules/rbac/rbac.module';
import { AuditModule } from '../src/modules/audit/audit.module';
import { StorageModule } from '../src/common/adapters/storage/storage.module';
import { LoggingModule } from '../src/common/logging/logging.module';
import { NotificationModule } from '../src/common/adapters/notification/notification.module';
import { AiModule } from '../src/common/adapters/ai/ai.module';
import { UsersModule } from '../src/modules/users/users.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { ProvidersModule } from '../src/modules/providers/providers.module';
import { VerificationModule } from '../src/modules/verification/verification.module';
import { AdminModule } from '../src/modules/admin/admin.module';
import { AvailabilityModule } from '../src/modules/availability/availability.module';
import { BookingsModule } from '../src/modules/bookings/bookings.module';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { ReviewsModule } from '../src/modules/reviews/reviews.module';
import { RankingModule } from '../src/modules/ranking/ranking.module';
import { AIModule } from '../src/modules/ai/ai.module';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(90000);

/**
 * Phase 14 · recommendations & smart matching (integration).
 *
 * The stub model cannot parse, so the deterministic fallback carries the
 * request end-to-end: real criteria → real database rows → ranked results
 * with evidence. No invented providers, ever.
 */
describe('Phase 14 · discovery (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
    await prisma.recommendationEvent.deleteMany({});
    await prisma.aiRequestLog.deleteMany({});
    await prisma.reviewDimension.deleteMany({});
    await prisma.reviewResponse.deleteMany({});
    await prisma.review.deleteMany({});
    await prisma.providerRankingSnapshot.deleteMany({});
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
    await prisma.customerProfile.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.service.deleteMany({});
  }

  async function register(role: 'CUSTOMER' | 'PROVIDER', email: string) {
    const reg = await auth.register({ email, password: 'Passw0rd!23', name: 'Tester', role });
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

  async function setupVerifiedProvider(email: string, businessName: string, price: number) {
    const prov = await register('PROVIDER', email);
    await call('POST', '/providers/me', prov.accessToken, { businessName, city: 'Nairobi' });
    const cat = await prisma.category.create({ data: { slug: `m-${Date.now()}${Math.random()}`, name: 'Makeup' } });
    await call('PUT', '/providers/me/categories', prov.accessToken, { categoryIds: [cat.id] });
    const svc = await call('POST', '/providers/me/services', prov.accessToken, {
      categoryId: cat.id, name: 'Bridal Makeup', price, durationMin: 120,
      deliveryTypes: ['AT_PROVIDER_LOCATION'], isActive: true,
    });
    const rules = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, startMin: 0, endMin: 1440 }));
    await call('PUT', '/providers/me/availability', prov.accessToken, { rules, exceptions: [] });
    const login = await auth.login({ email, password: 'Passw0rd!23' });
    await call('POST', '/providers/me/verification/submit', login.accessToken, { notes: 'v' });
    const vAdminEmail = `p14va_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    await register('CUSTOMER', vAdminEmail);
    const vAdminUser = await prisma.user.findUnique({ where: { email: vAdminEmail } });
    await rbac.assignRole(vAdminUser!.id, 'ADMIN');
    const vAdmin = await auth.login({ email: vAdminEmail, password: 'Passw0rd!23' });
    const user = await prisma.user.findUnique({ where: { email } });
    const profile = await prisma.providerProfile.findFirst({ where: { userId: user!.id } });
    await call('POST', `/admin/verifications/${profile!.id}/review`, vAdmin.accessToken, {
      decision: 'APPROVE', level: 'PROFESSIONAL_VERIFIED',
    });
    return { prov, profile: profile!, serviceId: svc.body.data.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule, QueueModule, RbacModule, AuditModule, StorageModule, LoggingModule, NotificationsModule, AiModule,
        UsersModule, AuthModule, ProvidersModule, VerificationModule, AdminModule,
        AvailabilityModule, BookingsModule, PaymentsModule, ReviewsModule, RankingModule, AIModule,
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

  it('matches a natural-language request to real providers only', async () => {
    const cust = await register('CUSTOMER', `p14c_${Date.now()}@example.com`);
    const a = await setupVerifiedProvider(`p14a_${Date.now()}@example.com`, 'Zuri Beauty', 2500);
    const b = await setupVerifiedProvider(`p14b_${Date.now()}@example.com`, 'Luxury Glow', 8000);

    const res = await call('POST', '/ai/match', cust.accessToken, {
      query: 'I need a makeup artist tomorrow in Nairobi under KSh 3,000.',
      limit: 5,
    });
    expect(res.status).toBe(201);
    // Budget + city filter: Zuri in, Luxury out — both rows are real.
    expect(res.body.data.results.map((r: any) => r.providerId)).toContain(a.profile.id);
    expect(res.body.data.results.map((r: any) => r.providerId)).not.toContain(b.profile.id);
    const ids = new Set([a.profile.id, b.profile.id]);
    for (const r of res.body.data.results) expect(ids.has(r.providerId)).toBe(true);
    expect(res.body.data.criteria.budget).toBe(3000);
  });

  it('explains a recommendation with database evidence', async () => {
    const cust = await register('CUSTOMER', `p14e_${Date.now()}@example.com`);
    const { prov, profile, serviceId } = await setupVerifiedProvider(
      `p14ep_${Date.now()}@example.com`, 'Evidence Studio', 2000,
    );

    // One completed + paid + reviewed booking = real evidence.
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: serviceId, startsAt: futureIso(0), deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });
    await fetch(base + '/api/v1/payments/webhook/mpesa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pay-signature': 'test-signature' },
      body: JSON.stringify({
        providerRef: payRes.body.data.providerRef, status: 'SUCCESSFUL', amount: '200000', currency: 'KES',
      }),
    });
    await call('PATCH', `/bookings/provider/${booking.body.data.id}/confirm`, prov.accessToken);
    await call('PATCH', `/bookings/provider/${booking.body.data.id}/start`, prov.accessToken);
    await call('PATCH', `/bookings/provider/${booking.body.data.id}/complete`, prov.accessToken);
    await call('POST', '/reviews', cust.accessToken, {
      bookingId: booking.body.data.id, overall: 5, body: 'Wonderful service, truly professional work.',
      dimensions: [
        { name: 'Quality', score: 5 },
        { name: 'Professionalism', score: 5 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 5 },
        { name: 'Value', score: 5 },
      ],
    });

    const explained = await call('POST', '/ai/recommend/explain', cust.accessToken, {
      itemType: 'provider', itemId: profile.id,
    });
    expect(explained.status).toBe(201);
    const text = explained.body.data.evidence.join(' ');
    expect(text).toMatch(/5\.0/);
    expect(text).toMatch(/1 job/);
    expect(text).toMatch(/verified/i);
  });

  it('recommends services within budget and products in stock', async () => {
    const cust = await register('CUSTOMER', `p14s_${Date.now()}@example.com`);
    await setupVerifiedProvider(`p14sp_${Date.now()}@example.com`, 'Budget Studio', 1500);

    const services = await call('POST', '/ai/recommend/services', cust.accessToken, { maxPrice: 2000, limit: 5 });
    expect(services.status).toBe(201);
    expect(services.body.data.length).toBeGreaterThan(0);
    for (const s of services.body.data) {
      expect(Number(s.priceCents) / 100).toBeLessThanOrEqual(2000);
    }

    const products = await call('POST', '/ai/recommend/products', cust.accessToken, { limit: 5 });
    expect(products.status).toBe(201);
    expect(Array.isArray(products.body.data)).toBe(true);
  });
});
