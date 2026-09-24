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
import { SearchModule } from '../src/modules/search/search.module';
import { BookingsModule } from '../src/modules/bookings/bookings.module';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { ReviewsModule } from '../src/modules/reviews/reviews.module';
import { ShopModule } from '../src/modules/shop/shop.module';
import { LoyaltyModule } from '../src/modules/loyalty/loyalty.module';
import { AnalyticsModule } from '../src/modules/analytics/analytics.module';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(90000);

/**
 * Phase 12 · analytics (integration).
 *
 * Full journey with every event firing: social touch → search → views →
 * slots → booking → payment → completion → review, then admin metrics must
 * tell one coherent story (funnel counts, revenue math, first-touch credit).
 */
describe('Phase 12 · analytics (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
    await prisma.analyticsEvent.deleteMany({});
    await prisma.attribution.deleteMany({});
    await prisma.searchEvent.deleteMany({});
    await prisma.loyaltyTransaction.deleteMany({});
    await prisma.loyaltyAccount.deleteMany({});
    await prisma.reviewDimension.deleteMany({});
    await prisma.reviewResponse.deleteMany({});
    await prisma.review.deleteMany({});
    await prisma.paymentTransaction.deleteMany({});
    await prisma.commission.deleteMany({});
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
    await prisma.customerProfile.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.service.deleteMany({});
  }

  async function register(role: 'CUSTOMER' | 'PROVIDER', email: string) {
    const reg = await auth.register({ email, password: 'Passw0rd!23', name: 'Tester', role });
    return reg.tokens;
  }

  async function superAdmin() {
    const reg = await auth.register({
      email: `p12admin_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
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

  function futureDate(): string {
    const d = new Date(Date.now() + 24 * 3600_000);
    return d.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule, RbacModule, AuditModule, StorageModule, LoggingModule, NotificationModule,
        UsersModule, AuthModule, ProvidersModule, VerificationModule, AdminModule,
        AvailabilityModule, SearchModule, BookingsModule, PaymentsModule, ReviewsModule,
        ShopModule, LoyaltyModule, AnalyticsModule,
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

  it('tells one coherent story across the whole journey', async () => {
    const admin = await superAdmin();
    const custEmail = `p12cust_${Date.now()}@example.com`;
    const cust = await register('CUSTOMER', custEmail);
    const custUser = await prisma.user.findUnique({ where: { email: custEmail } });

    // Social touch before anything else (first-touch credit).
    const touch = await call('POST', '/attribution/track', cust.accessToken, {
      utmSource: 'Instagram',
      utmMedium: 'social',
      utmCampaign: 'launch',
      providerSlug: 'pending-slug',
    });
    expect(touch.status).toBe(201);
    expect(touch.body.data.recorded).toBe(true);

    // Provider setup + verification.
    const provEmail = `p12prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Data Studio', city: 'Nairobi' });
    const cat = await prisma.category.create({ data: { slug: `dt-${Date.now()}`, name: 'Hair' } });
    await call('PUT', '/providers/me/categories', prov.accessToken, { categoryIds: [cat.id] });
    const svcRes = await call('POST', '/providers/me/services', prov.accessToken, {
      categoryId: cat.id, name: 'Braids', price: 2000, durationMin: 120,
      deliveryTypes: ['AT_PROVIDER_LOCATION'], isActive: true,
    });
    const serviceId = svcRes.body.data.id;
    const rules = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, startMin: 0, endMin: 1440 }));
    await call('PUT', '/providers/me/availability', prov.accessToken, { rules, exceptions: [] });
    const login = await auth.login({ email: provEmail, password: 'Passw0rd!23' });
    await call('POST', '/providers/me/verification/submit', login.accessToken, { notes: 'v' });
    const adminUser = await prisma.user.findUnique({ where: { email: `p12v_${Date.now()}@example.com` } }).catch(() => null);
    void adminUser;
    const vAdminEmail = `p12va_${Date.now()}@example.com`;
    await register('CUSTOMER', vAdminEmail);
    const vAdminUser = await prisma.user.findUnique({ where: { email: vAdminEmail } });
    await rbac.assignRole(vAdminUser!.id, 'ADMIN');
    const vAdmin = await auth.login({ email: vAdminEmail, password: 'Passw0rd!23' });
    const provUser = await prisma.user.findUnique({ where: { email: provEmail } });
    const profile = await prisma.providerProfile.findFirst({ where: { userId: provUser!.id } });
    await call('POST', `/admin/verifications/${profile!.id}/review`, vAdmin.accessToken, {
      decision: 'APPROVE', level: 'PROFESSIONAL_VERIFIED',
    });

    // Discovery: search → provider view → service view → slots.
    await call('GET', '/search?q=braids');
    await call('GET', `/providers/${profile!.slug}`);
    await call('GET', `/services/${serviceId}`);
    await call('GET', `/providers/${profile!.slug}/availability?serviceId=${serviceId}&date=${futureDate()}&days=1`);

    // Booking → payment → completion → review.
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: serviceId, startsAt: futureIso(0), deliveryType: 'AT_PROVIDER_LOCATION',
    });
    expect(booking.status).toBe(201);
    const bookingId = booking.body.data.id;
    const payRes = await call('POST', '/payments', cust.accessToken, { bookingId });
    const wh = await fetch(base + '/api/v1/payments/webhook/mpesa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pay-signature': 'test-signature' },
      body: JSON.stringify({
        providerRef: payRes.body.data.providerRef, status: 'SUCCESSFUL', amount: '200000', currency: 'KES',
      }),
    });
    expect((await wh.json()).captured).toBe(true);
    await call('PATCH', `/bookings/provider/${bookingId}/confirm`, prov.accessToken);
    await call('PATCH', `/bookings/provider/${bookingId}/start`, prov.accessToken);
    await call('PATCH', `/bookings/provider/${bookingId}/complete`, prov.accessToken);
    const review = await call('POST', '/reviews', cust.accessToken, {
      bookingId, overall: 5, body: 'Fantastic work, very professional service indeed.',
      dimensions: [
        { name: 'Quality', score: 5 },
        { name: 'Professionalism', score: 5 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 5 },
        { name: 'Value', score: 5 },
      ],
    });
    expect(review.status).toBe(201);

    // Events feed shows the journey in order-agnostic, typed form.
    const feed = await call('GET', '/admin/analytics/events?pageSize=100', admin.accessToken);
    const types = feed.body.data.map((e: any) => e.type);
    for (const t of ['SEARCH_PERFORMED', 'PROVIDER_VIEWED', 'SERVICE_VIEWED', 'BOOKING_STARTED', 'BOOKING_CREATED', 'PAYMENT_SUCCESSFUL', 'BOOKING_COMPLETED', 'REVIEW_CREATED', 'POINTS_EARNED']) {
      expect(types).toContain(t);
    }

    // Funnel: 1 view → 1 intent → 1 booking → 1 payment.
    const funnel = await call('GET', '/admin/analytics/funnel', admin.accessToken);
    expect(funnel.body.data.created).toBeGreaterThanOrEqual(1);
    expect(funnel.body.data.paid).toBeGreaterThanOrEqual(1);
    expect(funnel.body.data.overall).toBeGreaterThan(0);

    // Money: KES 2000 gross, 10% commission, net 190000... (gross − refunded).
    const overview = await call('GET', '/admin/analytics/overview', admin.accessToken);
    expect(Number(overview.body.data.revenue.grossCents)).toBeGreaterThanOrEqual(200000);
    expect(overview.body.data.revenue.commissionCents).toBe('20000');
    expect(overview.body.data.bookings.completed).toBeGreaterThanOrEqual(1);

    // Provider leaderboard credits the studio.
    const providers = await call('GET', '/admin/analytics/providers?limit=5', admin.accessToken);
    expect(providers.body.data.map((p: any) => p.providerId)).toContain(profile!.id);

    // First-touch attribution credits Instagram for this customer.
    const attr = await call('GET', '/admin/analytics/attribution', admin.accessToken);
    const ig = attr.body.data.channels.find((c: any) => c.channel === 'Instagram');
    expect(ig).toBeDefined();
    expect(Number(ig.revenueCents)).toBeGreaterThanOrEqual(200000);
    void custUser;
  });
});
