import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PrismaModule } from '../src/modules/prisma/prisma.module';
import { QueueModule } from '../src/modules/queue/queue.module';
import { RbacModule } from '../src/modules/rbac/rbac.module';
import { AuditModule } from '../src/modules/audit/audit.module';
import { StorageModule } from '../common/adapters/storage/storage.module';
import { LoggingModule } from '../common/logging/logging.module';
import { NotificationModule } from '../common/adapters/notification/notification.module';
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
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(30000);

function futureIso(hourOffset = 0): string {
  const d = new Date(Date.now() + 24 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10 + hourOffset, 0, 0)).toISOString();
}

describe('Phase 8 · reviews & ranking (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
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
    await prisma.customerProfile.deleteMany({});
    await prisma.providerProfile.deleteMany({});
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

  async function verifyProvider(userId: string): Promise<void> {
    const adminEmail = `adminv_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    await register('CUSTOMER', adminEmail);
    const admin = await promoteAdmin(adminEmail);
    await prisma.providerVerification.upsert({
      where: { providerId: userId },
      update: {},
      create: { providerId: userId, status: 'PENDING' },
    });
    await prisma.$transaction(async (tx) => {
      await tx.providerVerification.update({
        where: { providerId: userId },
        data: { status: 'VERIFIED', level: 'PROFESSIONAL_VERIFIED', reviewedAt: new Date(), reviewedById: admin.sub },
      });
      await tx.providerVerificationHistory.create({
        data: { providerId: userId, verificationId: userId, fromStatus: 'PENDING', toStatus: 'VERIFIED', actorId: admin.sub },
      });
    });
  }

  async function setupVerifiedProvider(userId: string, serviceName = 'Braids') {
    const cat = await prisma.category.create({ data: { slug: 'hair-' + Date.now() + Math.random(), name: 'Hair' } });
    await prisma.providerService.create({
      data: {
        providerId: userId,
        categoryId: cat.id,
        name: serviceName,
        priceCents: 200000,
        currency: 'KES',
        durationMin: 120,
        bufferMin: 30,
        deliveryTypes: ['AT_PROVIDER_LOCATION'],
        isActive: true,
      },
    });
    await prisma.availabilityRule.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({ providerId: userId, dayOfWeek: i, startMin: 0, endMin: 1440 })),
    });
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

  /** Reviews require a valid completed + paid booking: book → pay → capture → confirm → start → complete. */
  async function payBooking(bookingId: string, custToken: string) {
    const payRes = await call('POST', '/payments', custToken, { bookingId });
    expect(payRes.status).toBe(201);
    const res = await fetch(base + '/api/v1/payments/webhook/mpesa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pay-signature': 'test-signature' },
      body: JSON.stringify({
        providerRef: payRes.body.data.providerRef,
        status: 'SUCCESSFUL',
        amount: '200000',
        currency: 'KES',
      }),
    });
    const json = await res.json().catch(() => ({}));
    expect(json.captured).toBe(true);
  }

  async function completeBooking(bookingId: string, provToken: string) {
    await call('PATCH', `/bookings/provider/${bookingId}/confirm`, provToken);
    await call('PATCH', `/bookings/provider/${bookingId}/start`, provToken);
    await call('PATCH', `/bookings/provider/${bookingId}/complete`, provToken);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        QueueModule,
        RbacModule,
        AuditModule,
        StorageModule,
        LoggingModule,
        NotificationsModule,
        UsersModule,
        AuthModule,
        ProvidersModule,
        VerificationModule,
        AdminModule,
        AvailabilityModule,
        BookingsModule,
        PaymentsModule,
        ReviewsModule,
        RankingModule,
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

  // --- Review creation ---------------------------------------------------

  it('allows review after valid completed booking', async () => {
    const cust = await register('CUSTOMER', `rv_cust_${Date.now()}@example.com`);
    const reg = await register('PROVIDER', `rv_prov_${Date.now()}@example.com`);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: reg.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const startsAt = futureIso(0);

    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: (await prisma.providerService.findFirst({ where: { providerId: profile.id } })).id,
      startsAt,
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    expect(booking.status).toBe(201);
    const bookingId = booking.body.data.id;

    // Complete the booking
    await payBooking(bookingId, cust.accessToken);
    await completeBooking(bookingId, reg.accessToken);

    const review = await call('POST', '/reviews', cust.accessToken, {
      bookingId,
      overall: 5,
      title: 'Excellent service',
      body: 'The service was outstanding and highly professional.',
      dimensions: [
        { name: 'Quality', score: 5 },
        { name: 'Professionalism', score: 5 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 5 },
        { name: 'Value', score: 5 },
      ],
    });
    expect(review.status).toBe(201);
    expect(review.body.data.overall).toBe(5);
    expect(review.body.data.status).toBe('APPROVED');
  });

  it('prevents duplicate reviews for same booking', async () => {
    const cust = await register('CUSTOMER', `rv_dup_${Date.now()}@example.com`);
    const provEmail = `rv_dup_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const startsAt = futureIso(0);
    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: ps!.id,
      startsAt,
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const bookingId = booking.body.data.id;

    await payBooking(bookingId, cust.accessToken);
    await completeBooking(bookingId, prov.accessToken);

    const review1 = await call('POST', '/reviews', cust.accessToken, {
      bookingId,
      overall: 4,
      body: 'Good service.',
      dimensions: [
        { name: 'Quality', score: 4 },
        { name: 'Professionalism', score: 4 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 4 },
        { name: 'Value', score: 4 },
      ],
    });
    expect(review1.status).toBe(201);

    const review2 = await call('POST', '/reviews', cust.accessToken, {
      bookingId,
      overall: 5,
      body: 'Duplicate attempt.',
      dimensions: [
        { name: 'Quality', score: 5 },
        { name: 'Professionalism', score: 5 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 5 },
        { name: 'Value', score: 5 },
      ],
    });
    expect(review2.status).toBe(409);
  });

  it('prevents review without completed booking', async () => {
    const cust = await register('CUSTOMER', `rv_incomplete_${Date.now()}@example.com`);
    const provEmail = `rv_incomplete_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: ps!.id,
      startsAt: futureIso(0),
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    // Booking is PENDING, not COMPLETED
    expect(booking.body.data.status).toBe('PENDING');

    const review = await call('POST', '/reviews', cust.accessToken, {
      bookingId: booking.body.data.id,
      overall: 5,
      body: 'Trying to review incomplete booking.',
      dimensions: [
        { name: 'Quality', score: 5 },
        { name: 'Professionalism', score: 5 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 5 },
        { name: 'Value', score: 5 },
      ],
    });
    expect(review.status).toBe(400);
  });

  it('prevents review when payment not successful', async () => {
    const cust = await register('CUSTOMER', `rv_nopay_${Date.now()}@example.com`);
    const provEmail = `rv_nopay_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: ps!.id,
      startsAt: futureIso(0),
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const bookingId = booking.body.data.id;

    await call('PATCH', `/bookings/provider/${bookingId}/confirm`, prov.accessToken);
    await call('PATCH', `/bookings/provider/${bookingId}/start`, prov.accessToken);
    await call('PATCH', `/bookings/provider/${bookingId}/complete`, prov.accessToken);

    const review = await call('POST', '/reviews', cust.accessToken, {
      bookingId,
      overall: 4,
      body: 'Review without successful payment.',
      dimensions: [
        { name: 'Quality', score: 4 },
        { name: 'Professionalism', score: 4 },
        { name: 'Communication', score: 4 },
        { name: 'Punctuality', score: 4 },
        { name: 'Value', score: 4 },
      ],
    });
    expect(review.status).toBe(400);
  });

  it('prevents non-customer from creating review', async () => {
    const cust = await register('CUSTOMER', `rv_oth_${Date.now()}@example.com`);
    const other = await register('CUSTOMER', `rv_oth2_${Date.now()}@example.com`);
    const provEmail = `rv_oth_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: ps!.id,
      startsAt: futureIso(0),
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const bookingId = booking.body.data.id;

    await call('PATCH', `/bookings/provider/${bookingId}/confirm`, prov.accessToken);
    await call('PATCH', `/bookings/provider/${bookingId}/start`, prov.accessToken);
    await call('PATCH', `/bookings/provider/${bookingId}/complete`, prov.accessToken);

    const review = await call('POST', '/reviews', other.accessToken, {
      bookingId,
      overall: 5,
      body: 'Other customer trying to review.',
      dimensions: [
        { name: 'Quality', score: 5 },
        { name: 'Professionalism', score: 5 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 5 },
        { name: 'Value', score: 5 },
      ],
    });
    expect(review.status).toBe(403);
  });

  // --- Provider response -------------------------------------------------

  it('allows provider to respond to review', async () => {
    const cust = await register('CUSTOMER', `rv_resp_cust_${Date.now()}@example.com`);
    const provEmail = `rv_resp_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: ps!.id,
      startsAt: futureIso(0),
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const bookingId = booking.body.data.id;

    await payBooking(bookingId, cust.accessToken);
    await completeBooking(bookingId, prov.accessToken);

    const review = await call('POST', '/reviews', cust.accessToken, {
      bookingId,
      overall: 4,
      body: 'Good service overall.',
      dimensions: [
        { name: 'Quality', score: 4 },
        { name: 'Professionalism', score: 4 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 4 },
        { name: 'Value', score: 4 },
      ],
    });

    const response = await call('PATCH', `/reviews/${review.body.data.id}/respond`, prov.accessToken, {
      body: 'Thank you for your feedback!',
    });
    expect(response.status).toBe(200);
    expect(response.body.data.body).toBe('Thank you for your feedback!');
  });

  it('prevents non-provider from responding to review', async () => {
    const cust = await register('CUSTOMER', `rv_resp2_cust_${Date.now()}@example.com`);
    const provEmail = `rv_resp2_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: ps!.id,
      startsAt: futureIso(0),
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const bookingId = booking.body.data.id;

    await payBooking(bookingId, cust.accessToken);
    await completeBooking(bookingId, prov.accessToken);

    const review = await call('POST', '/reviews', cust.accessToken, {
      bookingId,
      overall: 5,
      body: 'Great service.',
      dimensions: [
        { name: 'Quality', score: 5 },
        { name: 'Professionalism', score: 5 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 5 },
        { name: 'Value', score: 5 },
      ],
    });

    const other = await register('CUSTOMER', `rv_resp2_other_${Date.now()}@example.com`);
    const response = await call('PATCH', `/reviews/${review.body.data.id}/respond`, other.accessToken, {
      body: 'Unauthorized response.',
    });
    expect(response.status).toBe(403);
  });

  // --- Admin moderation --------------------------------------------------

  it('allows admin to moderate reviews', async () => {
    const cust = await register('CUSTOMER', `rv_mod_cust_${Date.now()}@example.com`);
    const provEmail = `rv_mod_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: ps!.id,
      startsAt: futureIso(0),
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const bookingId = booking.body.data.id;

    await payBooking(bookingId, cust.accessToken);
    await completeBooking(bookingId, prov.accessToken);

    const review = await call('POST', '/reviews', cust.accessToken, {
      bookingId,
      overall: 3,
      body: 'Average experience.',
      dimensions: [
        { name: 'Quality', score: 3 },
        { name: 'Professionalism', score: 3 },
        { name: 'Communication', score: 3 },
        { name: 'Punctuality', score: 4 },
        { name: 'Value', score: 2 },
      ],
    });

    const adminEmail = `admin_review_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    await register('CUSTOMER', adminEmail);
    const admin = await promoteAdmin(adminEmail);

    const rejected = await call('PATCH', `/reviews/${review.body.data.id}/moderate`, admin.accessToken, {
      action: 'REJECT',
      notes: 'Inappropriate content',
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('REJECTED');

    const approved = await call('PATCH', `/reviews/${review.body.data.id}/moderate`, admin.accessToken, {
      action: 'APPROVE',
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');
  });

  it('prevents non-admin from moderating', async () => {
    const cust = await register('CUSTOMER', `rv_mod2_cust_${Date.now()}@example.com`);
    const provEmail = `rv_mod2_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: ps!.id,
      startsAt: futureIso(0),
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const bookingId = booking.body.data.id;

    await payBooking(bookingId, cust.accessToken);
    await completeBooking(bookingId, prov.accessToken);

    const review = await call('POST', '/reviews', cust.accessToken, {
      bookingId,
      overall: 5,
      body: 'Test review.',
      dimensions: [
        { name: 'Quality', score: 5 },
        { name: 'Professionalism', score: 5 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 5 },
        { name: 'Value', score: 5 },
      ],
    });

    const response = await call('PATCH', `/reviews/${review.body.data.id}/moderate`, cust.accessToken, {
      action: 'REMOVE',
    });
    expect(response.status).toBe(403);
  });

  // --- Ranking calculations ----------------------------------------------

  it('calculates quality score with all 7 components', async () => {
    const cust = await register('CUSTOMER', `rk_cust_${Date.now()}@example.com`);
    const provEmail = `rk_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });

    // Create multiple completed bookings to generate reviews and stats
    for (let i = 0; i < 5; i++) {
      const cEmail = `rk_book_cust_${Date.now()}_${i}@example.com`;
      const c = await register('CUSTOMER', cEmail);
      const booking = await call('POST', '/bookings', c.accessToken, {
        providerServiceId: ps!.id,
        startsAt: futureIso(i),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });
      const bid = booking.body.data.id;
      await payBooking(bid, c.accessToken);
      await completeBooking(bid, prov.accessToken);

      await call('POST', '/reviews', c.accessToken, {
        bookingId: bid,
        overall: 4 + (i % 2),
        body: 'Review for ranking test.',
        dimensions: [
          { name: 'Quality', score: 4 + (i % 2) },
          { name: 'Professionalism', score: 4 },
          { name: 'Communication', score: 5 },
          { name: 'Punctuality', score: 4 },
          { name: 'Value', score: 4 },
        ],
      });
    }

    const ranking = await call('GET', `/ranking/providers/${profile.id}`, cust.accessToken);
    expect(ranking.status).toBe(200);
    expect(ranking.body.data.providerId).toBe(profile.id);
    expect(typeof ranking.body.data.qualityScore).toBe('number');
    expect(ranking.body.data.qualityScore).toBeGreaterThanOrEqual(0);
    expect(ranking.body.data.qualityScore).toBeLessThanOrEqual(100);
    expect(ranking.body.data.components.length).toBe(7);

    const componentNames = ranking.body.data.components.map((c: any) => c.name);
    expect(componentNames).toContain('Customer Rating');
    expect(componentNames).toContain('Completed Jobs');
    expect(componentNames).toContain('Repeat Customer Rate');
    expect(componentNames).toContain('Cancellation Rate');
    expect(componentNames).toContain('Response Rate');
    expect(componentNames).toContain('On-time Completion');
    expect(componentNames).toContain('Verification / Profile');

    for (const comp of ranking.body.data.components) {
      expect(comp.normalizedScore).toBeGreaterThanOrEqual(0);
      expect(comp.normalizedScore).toBeLessThanOrEqual(100);
      expect(comp.weight).toBeGreaterThan(0);
      expect(comp.weight).toBeLessThanOrEqual(1);
    }
  });

  it('returns dashboard with trust signals', async () => {
    const cust = await register('CUSTOMER', `rk_dash_cust_${Date.now()}@example.com`);
    const provEmail = `rk_dash_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const dashboard = await call('GET', `/ranking/providers/${profile.id}/dashboard`, cust.accessToken);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.trustSignals).toBeDefined();
    expect(dashboard.body.data.trustSignals.rating).toBeDefined();
    expect(dashboard.body.data.trustSignals.customersServed).toBeDefined();
    expect(dashboard.body.data.trustSignals.completionRate).toBeDefined();
    expect(dashboard.body.data.trustSignals.responseRate).toBeDefined();
    expect(dashboard.body.data.trustSignals.verified).toBeDefined();
    expect(dashboard.body.data.insights).toBeDefined();
    expect(Array.isArray(dashboard.body.data.insights.strengths)).toBe(true);
    expect(Array.isArray(dashboard.body.data.insights.improvements)).toBe(true);
  });

  it('applies Bayesian averaging to prevent few-review domination', async () => {
    const provEmail = `rk_bayesian_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });
    const c = await register('CUSTOMER', `bk_bay_${Date.now()}@example.com`);
    const booking = await call('POST', '/bookings', c.accessToken, {
      providerServiceId: ps!.id,
      startsAt: futureIso(0),
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const bid = booking.body.data.id;
    await payBooking(bid, c.accessToken);
    await completeBooking(bid, prov.accessToken);

    await call('POST', '/reviews', c.accessToken, {
      bookingId: bid,
      overall: 5,
      body: 'Perfect score with one review.',
      dimensions: [
        { name: 'Quality', score: 5 },
        { name: 'Professionalism', score: 5 },
        { name: 'Communication', score: 5 },
        { name: 'Punctuality', score: 5 },
        { name: 'Value', score: 5 },
      ],
    });

    const ranking = await call('GET', `/ranking/providers/${profile.id}`, c.accessToken);
    const ratingComp = ranking.body.data.components.find((c: any) => c.name === 'Customer Rating');
    // With 1 review and Bayesian adjustment, score should not be 100 (pulled toward global mean 3.5)
    expect(ratingComp.normalizedScore).toBeLessThan(100);
  });

  it('uses log normalization to prevent completed jobs domination', async () => {
    const provEmail = `rk_log_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });

    // With many bookings, log normalization should still produce a score < 100
    for (let i = 0; i < 20; i++) {
      const c = await register('CUSTOMER', `bk_log_${Date.now()}_${i}@example.com`);
      const booking = await call('POST', '/bookings', c.accessToken, {
        providerServiceId: ps!.id,
        startsAt: futureIso(i),
        deliveryType: 'AT_PROVIDER_LOCATION',
      });
      const bid = booking.body.data.id;
      await call('PATCH', `/bookings/provider/${bid}/confirm`, prov.accessToken);
      await call('PATCH', `/bookings/provider/${bid}/start`, prov.accessToken);
      await call('PATCH', `/bookings/provider/${bid}/complete`, prov.accessToken);
    }

    const ranking = await call('GET', `/ranking/providers/${profile.id}`, c.accessToken);
    const jobsComp = ranking.body.data.components.find((c: any) => c.name === 'Completed Jobs');
    expect(jobsComp.normalizedScore).toBeGreaterThan(0);
    expect(jobsComp.normalizedScore).toBeLessThanOrEqual(100);
  });

  it('computes on-time rate correctly', async () => {
    const cust = await register('CUSTOMER', `rk_ontime_cust_${Date.now()}@example.com`);
    const provEmail = `rk_ontime_prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ps = await prisma.providerService.findFirst({ where: { providerId: profile.id } });
    const c = await register('CUSTOMER', `bk_ontime_${Date.now()}@example.com`);
    const booking = await call('POST', '/bookings', c.accessToken, {
      providerServiceId: ps!.id,
      startsAt: futureIso(0),
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const bid = booking.body.data.id;
    await call('PATCH', `/bookings/provider/${bid}/confirm`, prov.accessToken);
    await call('PATCH', `/bookings/provider/${bid}/start`, prov.accessToken);
    await call('PATCH', `/bookings/provider/${bid}/complete`, prov.accessToken);

    const ranking = await call('GET', `/ranking/providers/${profile.id}`, cust.accessToken);
    expect(ranking.body.data.signals.onTimeRate).toBeDefined();
    expect(ranking.body.data.signals.onTimeRate).toBeGreaterThanOrEqual(0);
    expect(ranking.body.data.signals.onTimeRate).toBeLessThanOrEqual(100);
  });

  it('handles provider with no reviews gracefully', async () => {
    const provEmail = `rk_norev_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', provEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov.user.id } });
    if (!profile) throw new Error('No profile');
    await verifyProvider(profile.id);
    await setupVerifiedProvider(profile.id);

    const ranking = await call('GET', `/ranking/providers/${profile.id}`, prov.accessToken);
    expect(ranking.status).toBe(200);
    expect(ranking.body.data.signals.totalReviews).toBe(0);
    expect(ranking.body.data.signals.overallRating).toBe(0);
    expect(typeof ranking.body.data.qualityScore).toBe('number');
  });
});
