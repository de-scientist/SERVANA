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
import { ShopModule } from '../src/modules/shop/shop.module';
import { LoyaltyModule } from '../src/modules/loyalty/loyalty.module';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(90000);

/**
 * Phase 10 · loyalty, referrals & promotions (integration).
 *
 * Retention engine end-to-end: signup bonus → booking points → review points
 * → referral rewards → promo discounts → redemption, every movement ledgered.
 */
describe('Phase 10 · retention (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
    await prisma.promotionRedemption.deleteMany({});
    await prisma.promotion.deleteMany({});
    await prisma.referral.deleteMany({});
    await prisma.referralCode.deleteMany({});
    await prisma.loyaltyTransaction.deleteMany({});
    await prisma.loyaltyAccount.deleteMany({});
    await prisma.loyaltyRule.deleteMany({});
    await prisma.loyaltyTier.deleteMany({});
    await prisma.reward.deleteMany({});
    await prisma.payoutItem.deleteMany({});
    await prisma.payout.deleteMany({});
    await prisma.payoutMethod.deleteMany({});
    await prisma.providerEarning.deleteMany({});
    await prisma.commission.deleteMany({});
    await prisma.refund.deleteMany({});
    await prisma.paymentTransaction.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.reviewDimension.deleteMany({});
    await prisma.reviewResponse.deleteMany({});
    await prisma.review.deleteMany({});
    await prisma.orderStatusHistory.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.serviceProductLink.deleteMany({});
    await prisma.product.deleteMany({});
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
    await prisma.commissionRule.deleteMany({});
  }

  async function register(role: 'CUSTOMER' | 'PROVIDER', email: string) {
    const reg = await auth.register({ email, password: 'Passw0rd!23', name: 'Tester', role });
    return reg.tokens;
  }

  // SECURITY (Phase 17): privileged roles are never self-registered — grant
  // out-of-band via RBAC, then re-login so the JWT carries fresh claims.
  async function superAdmin() {
    const email = `p10admin_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
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

  async function capturePayment(providerRef: string, amount: string) {
    const res = await fetch(base + '/api/v1/payments/webhook/mpesa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pay-signature': 'test-signature' },
      body: JSON.stringify({ providerRef, status: 'SUCCESSFUL', amount, currency: 'KES' }),
    });
    return res.json().catch(() => ({}));
  }

  function futureIso(hourOffset = 0): string {
    const d = new Date(Date.now() + 24 * 3600_000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10 + hourOffset, 0, 0)).toISOString();
  }

  async function setupVerifiedProvider(email: string) {
    const prov = await register('PROVIDER', email);
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Loyal Studio', city: 'Nairobi' });
    const cat = await prisma.category.create({ data: { slug: `hair-${Date.now()}${Math.random()}`, name: 'Hair' } });
    await call('PUT', '/providers/me/categories', prov.accessToken, { categoryIds: [cat.id] });
    const svc = await call('POST', '/providers/me/services', prov.accessToken, {
      categoryId: cat.id, name: 'Braids', price: 2000, durationMin: 120,
      deliveryTypes: ['AT_PROVIDER_LOCATION'], isActive: true,
    });
    const rules = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, startMin: 0, endMin: 1440 }));
    await call('PUT', '/providers/me/availability', prov.accessToken, { rules, exceptions: [] });
    // Verify via admin review.
    const adminEmail = `p10v_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    await register('CUSTOMER', adminEmail);
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    await rbac.assignRole(adminUser!.id, 'ADMIN');
    const admin = await auth.login({ email: adminEmail, password: 'Passw0rd!23' });
    const me = await auth.login({ email, password: 'Passw0rd!23' });
    await call('POST', '/providers/me/verification/submit', me.accessToken, { notes: 'verify' });
    const provProfile = await prisma.providerProfile.findFirst({
      where: { userId: (await prisma.user.findUnique({ where: { email } }))!.id },
    });
    await call('POST', `/admin/verifications/${provProfile!.id}/review`, admin.accessToken, {
      decision: 'APPROVE', level: 'PROFESSIONAL_VERIFIED',
    });
    return { prov, serviceId: svc.body.data.id, profile: provProfile };
  }

  async function paidCompletedBooking(custToken: string, provToken: string, serviceId: string, hour: number) {
    const booking = await call('POST', '/bookings', custToken, {
      providerServiceId: serviceId, startsAt: futureIso(hour), deliveryType: 'AT_PROVIDER_LOCATION',
    });
    const bookingId = booking.body.data.id;
    const payRes = await call('POST', '/payments', custToken, { bookingId });
    await capturePayment(payRes.body.data.providerRef, '200000');
    await call('PATCH', `/bookings/provider/${bookingId}/confirm`, provToken);
    await call('PATCH', `/bookings/provider/${bookingId}/start`, provToken);
    await call('PATCH', `/bookings/provider/${bookingId}/complete`, provToken);
    return bookingId;
  }

  const DIMS = [
    { name: 'Quality', score: 5 },
    { name: 'Professionalism', score: 5 },
    { name: 'Communication', score: 5 },
    { name: 'Punctuality', score: 5 },
    { name: 'Value', score: 5 },
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule, QueueModule, RbacModule, AuditModule, StorageModule, LoggingModule, NotificationsModule,
        UsersModule, AuthModule, ProvidersModule, VerificationModule, AdminModule,
        AvailabilityModule, BookingsModule, PaymentsModule, ReviewsModule, RankingModule,
        ShopModule, LoyaltyModule,
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

  describe('loyalty ledger', () => {
    it('awards a signup bonus with a ledger row', async () => {
      const cust = await register('CUSTOMER', `p10signup_${Date.now()}@example.com`);
      const account = await call('GET', '/loyalty/account', cust.accessToken);
      expect(account.status).toBe(200);
      expect(account.body.data.balance).toBe('10');
      expect(account.body.data.tier.name).toBe('NEW');

      const history = await call('GET', '/loyalty/history', cust.accessToken);
      expect(history.body.data.length).toBe(1);
      expect(history.body.data[0].type).toBe('BONUS');
    });

    it('awards booking points on payment and review points on review', async () => {
      const cust = await register('CUSTOMER', `p10earn_${Date.now()}@example.com`);
      const { prov, serviceId } = await setupVerifiedProvider(`p10earnprov_${Date.now()}@example.com`);
      const bookingId = await paidCompletedBooking(cust.accessToken, prov.accessToken, serviceId, 0);

      let account = await call('GET', '/loyalty/account', cust.accessToken);
      // 10 signup + 20 booking.
      expect(account.body.data.balance).toBe('30');

      const review = await call('POST', '/reviews', cust.accessToken, {
        bookingId, overall: 5, body: 'Superb service, very professional indeed.', dimensions: DIMS,
      });
      expect(review.status).toBe(201);

      account = await call('GET', '/loyalty/account', cust.accessToken);
      // +5 review.
      expect(account.body.data.balance).toBe('35');

      const history = await call('GET', '/loyalty/history', cust.accessToken);
      const types = history.body.data.map((t: any) => t.type);
      expect(types).toEqual(expect.arrayContaining(['BONUS', 'EARN_BOOKING', 'EARN_REVIEW']));
    });

    it('applies admin-configured rules to future earns', async () => {
      const admin = await superAdmin();
      const upd = await call('PATCH', '/admin/loyalty/rules', admin.accessToken, {
        event: 'REVIEW', points: 15, active: true,
      });
      expect(upd.status).toBe(200);

      const cust = await register('CUSTOMER', `p10rule_${Date.now()}@example.com`);
      const { prov, serviceId } = await setupVerifiedProvider(`p10ruleprov_${Date.now()}@example.com`);
      const bookingId = await paidCompletedBooking(cust.accessToken, prov.accessToken, serviceId, 1);
      await call('POST', '/reviews', cust.accessToken, {
        bookingId, overall: 5, body: 'Lovely experience, highly recommended place.', dimensions: DIMS,
      });

      const account = await call('GET', '/loyalty/account', cust.accessToken);
      // 10 signup + 20 booking + 15 review (new rule).
      expect(account.body.data.balance).toBe('45');

      // Restore default for other tests.
      await call('PATCH', '/admin/loyalty/rules', admin.accessToken, { event: 'REVIEW', points: 5, active: true });
    });

    it('redeems rewards only with sufficient balance', async () => {
      const admin = await superAdmin();
      const created = await call('POST', '/admin/rewards', admin.accessToken, { name: 'KES 100 Off', cost: 100 });
      expect(created.status).toBe(201);

      const cust = await register('CUSTOMER', `p10redeem_${Date.now()}@example.com`);
      const poor = await call('POST', '/loyalty/redeem', cust.accessToken, { rewardId: created.body.data.id });
      expect(poor.status).toBe(400);

      // Earn up to 110: 10 signup + 5×20 bookings.
      const { prov, serviceId } = await setupVerifiedProvider(`p10redeemprov_${Date.now()}@example.com`);
      for (let i = 0; i < 5; i++) {
        // Bookings must belong to the redeemer for points; reuse same customer with different slots.
        const booking = await call('POST', '/bookings', cust.accessToken, {
          providerServiceId: serviceId, startsAt: futureIso(10 + i), deliveryType: 'AT_PROVIDER_LOCATION',
        });
        const payRes = await call('POST', '/payments', cust.accessToken, { bookingId: booking.body.data.id });
        await capturePayment(payRes.body.data.providerRef, '200000');
      }
      const rich = await call('POST', '/loyalty/redeem', cust.accessToken, { rewardId: created.body.data.id });
      expect(rich.status).toBe(201);
      expect(rich.body.data.voucher).toMatch(/^RWD-/);

      const account = await call('GET', '/loyalty/account', cust.accessToken);
      expect(account.body.data.balance).toBe('10'); // 110 − 100
    });
  });

  describe('referrals', () => {
    it('issues codes, blocks abuse, and pays on first completed booking', async () => {
      const referrer = await register('CUSTOMER', `p10ref_${Date.now()}@example.com`);
      const code = await call('GET', '/referrals/code', referrer.accessToken);
      expect(code.status).toBe(200);
      expect(code.body.data.code).toMatch(/^SVN-/);

      // Self-claim blocked.
      const self = await call('POST', '/referrals/claim', referrer.accessToken, { code: code.body.data.code });
      expect(self.status).toBe(400);

      // Unknown code → 404.
      const unknown = await call('POST', '/referrals/claim', referrer.accessToken, { code: 'SVN-NOPE01' });
      expect(unknown.status).toBe(404);

      const friend = await register('CUSTOMER', `p10friend_${Date.now()}@example.com`);
      const claim = await call('POST', '/referrals/claim', friend.accessToken, { code: code.body.data.code });
      expect(claim.status).toBe(201);

      // Double-claim blocked.
      const again = await call('POST', '/referrals/claim', friend.accessToken, { code: code.body.data.code });
      expect(again.status).toBe(400);

      const { prov, serviceId } = await setupVerifiedProvider(`p10refprov_${Date.now()}@example.com`);
      await paidCompletedBooking(friend.accessToken, prov.accessToken, serviceId, 2);

      const mine = await call('GET', '/referrals/mine', referrer.accessToken);
      expect(mine.body.data.sent[0].rewardStatus).toBe('PAID');

      const account = await call('GET', '/loyalty/account', referrer.accessToken);
      // 10 signup + 50 referral.
      expect(account.body.data.balance).toBe('60');
    });
  });

  describe('promotions', () => {
    it('discounts checkout, then blocks reuse beyond the per-customer cap', async () => {
      const admin = await superAdmin();
      const created = await call('POST', '/admin/promotions', admin.accessToken, {
        code: `SAVE10-${Date.now()}`,
        name: 'Save 10 percent',
        kind: 'PERCENTAGE',
        value: 1000,
        scope: 'GLOBAL',
      });
      expect(created.status).toBe(201);
      const code = created.body.data.code;

      const cust = await register('CUSTOMER', `p10promo_${Date.now()}@example.com`);
      const prod = await call('POST', '/admin/products', admin.accessToken, {
        name: `Promo Oil ${Date.now()}`, sku: `PRM-${Date.now()}`, price: 2000, currency: 'KES',
        inventory: [{ quantity: 10 }],
      });
      const productId = prod.body.data.id;
      await call('POST', '/cart/items', cust.accessToken, { productId, qty: 1 });

      const preview = await call('POST', '/cart/promotions/validate', cust.accessToken, { code });
      expect(preview.status).toBe(200);
      expect(preview.body.data.discountCents).toBe('20000'); // 10% of 200000

      const checkout = await call('POST', '/orders/checkout', cust.accessToken, { method: 'MPESA', promoCode: code });
      expect(checkout.status).toBe(201);
      expect(checkout.body.data.order.discountCents).toBe('20000');
      expect(checkout.body.data.order.totalCents).toBe('180000');

      // Second use by the same customer → rejected (default cap 1).
      await call('POST', '/cart/items', cust.accessToken, { productId, qty: 1 });
      const reuse = await call('POST', '/orders/checkout', cust.accessToken, { method: 'MPESA', promoCode: code });
      expect(reuse.status).toBe(400);
    });
  });
});
