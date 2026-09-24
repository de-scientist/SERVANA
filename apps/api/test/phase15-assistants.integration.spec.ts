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

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(90000);

/**
 * Phase 15 · assistants (integration).
 *
 * Customer chat routes intents without executing money moves; provider
 * drafts never publish; admin questions answer from ledger aggregations.
 */
describe('Phase 15 · assistants (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
    await prisma.aiActionProposal.deleteMany({});
    await prisma.aiRequestLog.deleteMany({});
    await prisma.recommendationEvent.deleteMany({});
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
      email: `p15admin_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule, RbacModule, AuditModule, StorageModule, LoggingModule, NotificationModule, AiModule,
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

  describe('customer assistant', () => {
    it('answers FAQs and searches without booking anything', async () => {
      const cust = await register('CUSTOMER', `p15c_${Date.now()}@example.com`);

      const faq = await call('POST', '/ai/assistant/chat', cust.accessToken, { message: 'How do refunds work?' });
      expect(faq.status).toBe(201);
      expect(faq.body.data.intent).toBe('support_faq');

      const search = await call('POST', '/ai/assistant/chat', cust.accessToken, { message: 'I need braids this weekend' });
      expect(search.body.data.intent).toBe('search');
      expect(search.body.data.confirmationRequired).toBeUndefined();

      // Nothing was booked as a side effect.
      expect(await prisma.booking.count({})).toBe(0);
    });

    it('returns confirmations instead of executing irreversible actions', async () => {
      const cust = await register('CUSTOMER', `p15b_${Date.now()}@example.com`);

      const res = await call('POST', '/ai/assistant/chat', cust.accessToken, { message: 'Cancel my booking SVN-1 right now' });
      expect(res.body.data.intent).toBe('booking_action');
      expect(res.body.data.confirmationRequired.action).toBe('booking.cancel');
      expect(await prisma.booking.count({})).toBe(0);
    });

    it('explains the customer’s own booking', async () => {
      const custEmail = `p15e_${Date.now()}@example.com`;
      const cust = await register('CUSTOMER', custEmail);
      const provEmail = `p15ep_${Date.now()}@example.com`;
      const prov = await register('PROVIDER', provEmail);
      await call('POST', '/providers/me', prov.accessToken, { businessName: 'Explain Studio', city: 'Nairobi' });
      const cat = await prisma.category.create({ data: { slug: `ex-${Date.now()}`, name: 'Hair' } });
      await call('PUT', '/providers/me/categories', prov.accessToken, { categoryIds: [cat.id] });
      const svc = await call('POST', '/providers/me/services', prov.accessToken, {
        categoryId: cat.id, name: 'Braids', price: 2000, durationMin: 120,
        deliveryTypes: ['AT_PROVIDER_LOCATION'], isActive: true,
      });
      const rules = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, startMin: 0, endMin: 1440 }));
      await call('PUT', '/providers/me/availability', prov.accessToken, { rules, exceptions: [] });
      const login = await auth.login({ email: provEmail, password: 'Passw0rd!23' });
      await call('POST', '/providers/me/verification/submit', login.accessToken, { notes: 'v' });
      const vAdminEmail = `p15ve_${Date.now()}@example.com`;
      await register('CUSTOMER', vAdminEmail);
      const vAdminUser = await prisma.user.findUnique({ where: { email: vAdminEmail } });
      await rbac.assignRole(vAdminUser!.id, 'ADMIN');
      const vAdmin = await auth.login({ email: vAdminEmail, password: 'Passw0rd!23' });
      const provUser = await prisma.user.findUnique({ where: { email: provEmail } });
      const profile = await prisma.providerProfile.findFirst({ where: { userId: provUser!.id } });
      await call('POST', `/admin/verifications/${profile!.id}/review`, vAdmin.accessToken, {
        decision: 'APPROVE', level: 'PROFESSIONAL_VERIFIED',
      });

      const booking = await call('POST', '/bookings', cust.accessToken, {
        providerServiceId: svc.body.data.id, startsAt: futureIso(0), deliveryType: 'AT_PROVIDER_LOCATION',
      });
      expect(booking.status).toBe(201);

      const res = await call('POST', '/ai/assistant/chat', cust.accessToken, { message: 'What is my booking status?' });
      expect(res.body.data.intent).toBe('explain_booking');
      expect(res.body.data.message).toContain(booking.body.data.reference);
    });
  });

  describe('provider assistant', () => {
    it('drafts without publishing and scopes to the own profile', async () => {
      const prov = await register('PROVIDER', `p15p_${Date.now()}@example.com`);
      await call('POST', '/providers/me', prov.accessToken, { businessName: 'Draft Studio', city: 'Nairobi' });

      const draft = await call('POST', '/ai/assistant/provider', prov.accessToken, {
        kind: 'instagram-caption', topic: 'Weekend braids offer', tone: 'Friendly',
      });
      expect(draft.status).toBe(201);
      expect(draft.body.data.caption.length).toBeGreaterThan(0);
      expect(draft.body.data.published).toBe(false);

      const desc = await call('POST', '/ai/assistant/provider', prov.accessToken, {
        kind: 'service-description', topic: 'Knotless braids', tone: 'Professional',
      });
      expect(desc.body.data.published).toBe(false);

      const perf = await call('POST', '/ai/assistant/provider', prov.accessToken, { kind: 'performance-explainer' });
      expect(perf.body.data.summary).toMatch(/score/i);
    });

    it('blocks customers from provider drafting', async () => {
      const cust = await register('CUSTOMER', `p15pc_${Date.now()}@example.com`);
      const res = await call('POST', '/ai/assistant/provider', cust.accessToken, {
        kind: 'instagram-caption', topic: 'Hi',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('admin assistant', () => {
    it('answers from ledger aggregations, never raw SQL', async () => {
      const admin = await superAdmin();

      const trend = await call('POST', '/admin/ai/ask', admin.accessToken, {
        question: 'Why did bookings decline this month?',
      });
      expect(trend.status).toBe(201);
      expect(trend.body.data.answer).toMatch(/Bookings/);
      expect(trend.body.data.data.current).toBeDefined();

      const cancel = await call('POST', '/admin/ai/ask', admin.accessToken, {
        question: 'Which providers have high cancellation rates?',
      });
      expect(cancel.body.data.data.rows).toBeDefined();

      const demand = await call('POST', '/admin/ai/ask', admin.accessToken, {
        question: 'Which areas have high demand and few providers?',
      });
      expect(demand.body.data.data.rows).toBeDefined();
    });

    it('blocks non-admins from asking', async () => {
      const cust = await register('CUSTOMER', `p15na_${Date.now()}@example.com`);
      const res = await call('POST', '/admin/ai/ask', cust.accessToken, { question: 'Revenue?' });
      expect(res.status).toBe(403);
    });
  });
});
