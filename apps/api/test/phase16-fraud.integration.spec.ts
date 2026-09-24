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
import { FraudModule } from '../src/modules/fraud/fraud.module';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(90000);

/**
 * Phase 16 · fraud risk workflows (integration).
 *
 * A planted five-star burst triggers a HIGH alert with evidence; a human
 * reviews it with an audited ACTIONED decision. Nothing punishes anyone
 * automatically — the scan creates signals only.
 */
describe('Phase 16 · risk workflows (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
    await prisma.fraudAlert.deleteMany({});
    await prisma.aiActionProposal.deleteMany({});
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

  // SECURITY (Phase 17): privileged roles are never self-registered — grant
  // out-of-band via RBAC, then re-login so the JWT carries fresh claims.
  async function superAdmin() {
    const email = `p16admin_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    await auth.register({ email, password: 'Passw0rd!23', name: 'Super Admin', role: 'CUSTOMER' });
    const created = await prisma.user.findUnique({ where: { email } });
    await rbac.assignRole(created!.id, 'SUPER_ADMIN');
    return auth.login({ email, password: 'Passw0rd!23' });
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule, QueueModule, RbacModule, AuditModule, StorageModule, LoggingModule, NotificationsModule, AiModule,
        UsersModule, AuthModule, ProvidersModule, VerificationModule, AdminModule,
        AvailabilityModule, BookingsModule, PaymentsModule, ReviewsModule, RankingModule, AIModule, FraudModule,
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

  it('detects a planted review burst, then a human actions it with audit', async () => {
    const admin = await superAdmin();
    const prov = await register('PROVIDER', `p16p_${Date.now()}@example.com`);
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Burst Studio', city: 'Nairobi' });

    const allProfiles = await prisma.providerProfile.findMany({ take: 1 });
    const profileId = allProfiles[0].id;

    // Plant: five distinct customers, five stars, one hour.
    const reviewIds: string[] = [];
    const stamp = Date.now();
    for (let i = 0; i < 5; i++) {
      const custEmail = `p16c_${stamp}_${i}@example.com`;
      await register('CUSTOMER', custEmail);
      const custUser = await prisma.user.findUnique({ where: { email: custEmail } });
      const review = await prisma.review.create({
        data: {
          bookingId: `00000000-0000-0000-0000-00000000000${i}`,
          customerId: custUser!.id,
          providerId: profileId,
          overall: 5,
          status: 'APPROVED',
          title: `Amazing work part ${i}`,
          body: `Absolutely loved the experience, five star service number ${i} today`,
        },
      });
      reviewIds.push(review.id);
    }

    const scan = await call('POST', '/admin/fraud/scan', admin.accessToken, { days: 30 });
    expect(scan.status).toBe(201);
    expect(scan.body.data.created).toBeGreaterThanOrEqual(1);

    const alerts = await call('GET', '/admin/fraud/alerts?status=OPEN', admin.accessToken);
    const burst = alerts.body.data.find((a: any) => a.checkKey === 'fake-review-burst');
    expect(burst).toBeDefined();
    expect(burst.riskLevel).toBe('HIGH');
    expect(burst.reason).toMatch(/five-star/);
    expect(burst.evidence.reviewIds).toEqual(expect.arrayContaining(reviewIds));
    expect(burst.recommendedAction).toBeTruthy();

    // Same scan again: deduplicated, no second alert.
    const rescan = await call('POST', '/admin/fraud/scan', admin.accessToken, { days: 30 });
    expect(rescan.body.data.skippedDuplicates).toBeGreaterThanOrEqual(1);

    // Human review with a recorded decision (ACTIONED needs a note).
    const noNote = await call('POST', `/admin/fraud/alerts/${burst.id}/review`, admin.accessToken, {
      status: 'ACTIONED',
    });
    expect(noNote.status).toBe(400);

    const actioned = await call('POST', `/admin/fraud/alerts/${burst.id}/review`, admin.accessToken, {
      status: 'ACTIONED',
      note: 'Confirmed templated reviews; rejected them and warned the provider via support',
    });
    expect(actioned.body.data.status).toBe('ACTIONED');

    const trail = await prisma.auditLog.findMany({
      where: { entity: 'fraudAlert', entityId: burst.id },
    });
    expect(trail.map((t) => t.action)).toContain('fraud.review');
  });

  it('blocks non-admins from scanning and reviewing', async () => {
    const cust = await register('CUSTOMER', `p16x_${Date.now()}@example.com`);
    expect((await call('POST', '/admin/fraud/scan', cust.accessToken, {})).status).toBe(403);
    expect((await call('GET', '/admin/fraud/alerts', cust.accessToken)).status).toBe(403);
  });

  it('serves experimental forecasts with disclaimers', async () => {
    const admin = await superAdmin();
    const forecast = await call('GET', '/admin/ai/forecast/demand', admin.accessToken);
    expect(forecast.status).toBe(200);
    expect(forecast.body.data.disclaimer).toMatch(/Experimental/);
    expect(forecast.body.data.dataSufficient).toBe(false);

    const watchlist = await call('GET', '/admin/ai/forecast/churn-watchlist', admin.accessToken);
    expect(watchlist.body.data.experimental).toBe(true);
  });
});
