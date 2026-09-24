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
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(90000);

/**
 * Phase 7 · provider earnings & payouts (integration).
 *
 * Proves financial ledger integrity end-to-end:
 *   Payment (gross) == Commission + Payment fees + Provider earning (net)
 * and no transaction disappears between Payment → Commission → Earning → Payout.
 *
 * Covers: earnings dashboard breakdown, secure payout methods, full payout
 * lifecycle (PENDING → PROCESSING → SUCCESSFUL → FAILED → REVERSED),
 * failure + retry, manual adjustments with audit, and reconciliation.
 */
describe('Phase 7 · provider earnings & payouts (integration)', () => {
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

  async function call(method: string, path: string, token?: string, body?: unknown, extraHeaders?: Record<string, string>) {
    const headers: Record<string, string> = { ...extraHeaders };
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

  async function webhook(providerId: string, event: any) {
    return call('POST', `/payments/webhook/${providerId}`, undefined, event, { 'x-pay-signature': 'test-signature' });
  }

  async function setupVerifiedProvider(email: string) {
    const prov = await register('PROVIDER', email);
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Payout Studio', city: 'Nairobi' });
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

  /** Full booking → payment → capture flow; returns ids for ledger assertions. */
  async function paidBooking(suffix: string, hourOffset: number) {
    const cust = await register('CUSTOMER', `p7cust_${suffix}_${Date.now()}@example.com`);
    const { prov, serviceId } = await setupVerifiedProvider(`p7prov_${suffix}_${Date.now()}@example.com`);
    const booking = await call('POST', '/bookings', cust.accessToken, {
      providerServiceId: serviceId,
      startsAt: futureIso(hourOffset),
      deliveryType: 'AT_PROVIDER_LOCATION',
    });
    expect(booking.status).toBe(201);
    const bookingId = booking.body.data.id;
    const payRes = await call('POST', '/payments', cust.accessToken, { bookingId });
    expect(payRes.status).toBe(201);
    const paymentId = payRes.body.data.id;
    const wh = await webhook('mpesa', {
      providerRef: payRes.body.data.providerRef,
      status: 'SUCCESSFUL',
      amount: '200000',
      currency: 'KES',
    });
    expect(wh.body.captured).toBe(true);
    return { cust, prov, bookingId, paymentId };
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
  }, 90000);

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
    await app.close();
  }, 90000);

  describe('ledger integrity (payment → commission → earning → payout)', () => {
    it('auto-creates an earning AND a linked payout item on capture (nothing disappears)', async () => {
      const { bookingId, paymentId } = await paidBooking('trail', 0);

      const earning = await prisma.providerEarning.findFirst({ where: { bookingId } });
      expect(earning).toBeDefined();
      expect(earning!.grossCents.toString()).toBe('200000');
      expect(earning!.commissionCents.toString()).toBe('20000');
      expect(earning!.netCents.toString()).toBe('180000');

      const payout = await prisma.payout.findFirst({ where: { reference: `PO_${paymentId}` }, include: { items: true } });
      expect(payout).toBeDefined();
      expect(payout!.status).toBe('PENDING');
      expect(payout!.totalCents.toString()).toBe('180000');
      // The ledger gap fix: every auto-payout links its earning.
      expect(payout!.items).toHaveLength(1);
      expect(payout!.items[0].earningId).toBe(earning!.id);
      expect(payout!.items[0].amountCents.toString()).toBe('180000');
    });

    it('reconciliation proves the ledger is intact (discrepancy 0, no orphans)', async () => {
      const adminEmail = `p7recon_${Date.now()}@example.com`;
      // SECURITY (Phase 17): privileged roles are granted out-of-band, never self-registered.
      await auth.register({ email: adminEmail, password: 'Passw0rd!23', name: 'Super Admin', role: 'CUSTOMER' });
      const p7reconUser = await prisma.user.findUnique({ where: { email: adminEmail } });
      await rbac.assignRole(p7reconUser!.id, 'SUPER_ADMIN');
      const reg = { tokens: await auth.login({ email: adminEmail, password: 'Passw0rd!23' }) };

      const result = await call('GET', '/payments/payouts/reconciliation', reg.tokens.accessToken);
      expect(result.status).toBe(200);
      const data = result.body.data;
      expect(data.paymentsCount).toBeGreaterThanOrEqual(1);
      expect(data.discrepancyCents).toBe('0');
      expect(data.ledgerIntact).toBe(true);
      expect(data.orphanPaymentsMissingCommission ?? []).toEqual([]);
      expect(data.orphanPaymentsMissingEarning ?? []).toEqual([]);
      expect(data.orphanEarningsWithoutPayment ?? []).toEqual([]);
      expect(data.overPayoutCents ?? '0').toBe('0');
    });

    it('provider earnings dashboard shows the full breakdown', async () => {
      const { prov } = await paidBooking('dash', 1);

      const dashboard = await call('GET', '/payments/payouts/earnings', prov.accessToken);
      expect(dashboard.status).toBe(200);
      const d = dashboard.body.data;
      const gross = d.grossEarningsCents ?? d.totalGrossCents;
      const commission = d.platformCommissionCents ?? d.totalCommissionCents;
      const fees = d.paymentFeesCents ?? d.totalPaymentFeesCents;
      const refunds = d.refundsCents ?? d.totalRefundCents;
      const adjustments = d.adjustmentsCents ?? d.totalAdjustmentCents;
      const pending = d.pendingEarningsCents;
      const available = d.availableEarningsCents ?? d.availableBalanceCents;
      const paid = d.paidEarningsCents ?? d.paidOutCents ?? d.totalPaidOutCents;
      for (const [k, v] of Object.entries({ gross, commission, fees, refunds, adjustments, pending, available, paid })) {
        expect(typeof v, k).toBe('string');
      }
      expect(gross).toBe('200000');
      expect(commission).toBe('20000');
      // 200000 gross - 20000 commission - 0 fees = 180000 available
      expect(available).toBe('180000');
    });
  });

  describe('payout failure and retry', () => {
    it('FAILED → PENDING → SUCCESSFUL with earning PAID, all audited', async () => {
      const adminEmail = `p7fail_${Date.now()}@example.com`;
      // SECURITY (Phase 17): privileged roles are granted out-of-band, never self-registered.
      await auth.register({ email: adminEmail, password: 'Passw0rd!23', name: 'Super Admin', role: 'CUSTOMER' });
      const p7failUser = await prisma.user.findUnique({ where: { email: adminEmail } });
      await rbac.assignRole(p7failUser!.id, 'SUPER_ADMIN');
      const reg = { tokens: await auth.login({ email: adminEmail, password: 'Passw0rd!23' }) };
      const { bookingId, paymentId } = await paidBooking('fail', 2);

      const payout = await prisma.payout.findFirst({ where: { reference: `PO_${paymentId}` } });
      expect(payout).toBeDefined();
      const payoutId = payout!.id;

      // Simulate a PSP failure.
      const fail = await call('POST', `/payments/payouts/${payoutId}/fail`, reg.tokens.accessToken, { reason: 'PSP timeout (test)' });
      expect(fail.status).toBe(200);
      expect(fail.body.data.status).toBe('FAILED');

      // Failed payout view surfaces it.
      const failed = await call('GET', '/payments/payouts/failed', reg.tokens.accessToken);
      expect(failed.status).toBe(200);
      const failedList = failed.body.data.data.failedPayouts;
      expect(failedList.map((p: any) => p.id)).toContain(payoutId);

      // Retry re-queues it.
      const retry = await call('POST', `/payments/payouts/${payoutId}/retry`, reg.tokens.accessToken);
      expect(retry.status).toBe(200);
      expect(retry.body.data.status).toBe('PENDING');

      // Processing settles the earning.
      const proc = await call('POST', `/payments/payouts/${payoutId}/process`, reg.tokens.accessToken);
      expect(proc.status).toBe(200);
      expect(proc.body.data.status).toBe('SUCCESSFUL');

      const earning = await prisma.providerEarning.findFirst({ where: { bookingId } });
      expect(earning!.status).toBe('PAID');

      // Ledger still intact after failure + retry + settlement.
      const recon = await call('GET', '/payments/payouts/reconciliation', reg.tokens.accessToken);
      expect(recon.body.data.ledgerIntact).toBe(true);
      expect(recon.body.data.discrepancyCents).toBe('0');

      // Every step left an audit trail.
      const audits = await prisma.auditLog.findMany({ where: { entity: 'payout', entityId: payoutId } });
      const actions = audits.map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(['payout.forceFail', 'payout.retry', 'payout.success']));

      // Transaction detail exposes the full money trail.
      const detail = await call('GET', `/payments/payouts/${payoutId}/transactions`, reg.tokens.accessToken);
      expect(detail.status).toBe(200);
      expect(detail.body.data.items).toHaveLength(1);
      expect(detail.body.data.relatedPayments.length).toBeGreaterThanOrEqual(1);
      expect(detail.body.data.auditTrail.length).toBeGreaterThanOrEqual(3);
    });

    it('retry is rejected after max retries', async () => {
      const adminEmail = `p7maxretry_${Date.now()}@example.com`;
      // SECURITY (Phase 17): privileged roles are granted out-of-band, never self-registered.
      await auth.register({ email: adminEmail, password: 'Passw0rd!23', name: 'Super Admin', role: 'CUSTOMER' });
      const p7maxretryUser = await prisma.user.findUnique({ where: { email: adminEmail } });
      await rbac.assignRole(p7maxretryUser!.id, 'SUPER_ADMIN');
      const reg = { tokens: await auth.login({ email: adminEmail, password: 'Passw0rd!23' }) };
      const { paymentId } = await paidBooking('maxretry', 3);
      const payout = await prisma.payout.findFirst({ where: { reference: `PO_${paymentId}` } });
      const payoutId = payout!.id;

      for (let i = 0; i < 3; i++) {
        await call('POST', `/payments/payouts/${payoutId}/fail`, reg.tokens.accessToken, { reason: `fail ${i}` });
        const retry = await call('POST', `/payments/payouts/${payoutId}/retry`, reg.tokens.accessToken);
        expect(retry.status).toBe(200);
      }
      await call('POST', `/payments/payouts/${payoutId}/fail`, reg.tokens.accessToken, { reason: 'final fail' });
      const over = await call('POST', `/payments/payouts/${payoutId}/retry`, reg.tokens.accessToken);
      expect(over.status).toBe(400);
    });
  });

  describe('reversal and manual adjustments', () => {
    it('SUCCESSFUL → REVERSED restores the earning to AVAILABLE', async () => {
      const adminEmail = `p7rev_${Date.now()}@example.com`;
      // SECURITY (Phase 17): privileged roles are granted out-of-band, never self-registered.
      await auth.register({ email: adminEmail, password: 'Passw0rd!23', name: 'Super Admin', role: 'CUSTOMER' });
      const p7revUser = await prisma.user.findUnique({ where: { email: adminEmail } });
      await rbac.assignRole(p7revUser!.id, 'SUPER_ADMIN');
      const reg = { tokens: await auth.login({ email: adminEmail, password: 'Passw0rd!23' }) };
      const { bookingId, paymentId } = await paidBooking('rev', 4);
      const payout = await prisma.payout.findFirst({ where: { reference: `PO_${paymentId}` } });
      const payoutId = payout!.id;

      await call('POST', `/payments/payouts/${payoutId}/process`, reg.tokens.accessToken);
      const reverse = await call('POST', `/payments/payouts/${payoutId}/reverse`, reg.tokens.accessToken, { reason: 'duplicate payout (test)' });
      expect(reverse.status).toBe(200);
      expect(reverse.body.data.status).toBe('REVERSED');

      const earning = await prisma.providerEarning.findFirst({ where: { bookingId } });
      expect(earning!.status).toBe('AVAILABLE');
    });

    it('manual adjustment requires a reason, updates the total, and is audited', async () => {
      const adminEmail = `p7adj_${Date.now()}@example.com`;
      // SECURITY (Phase 17): privileged roles are granted out-of-band, never self-registered.
      await auth.register({ email: adminEmail, password: 'Passw0rd!23', name: 'Super Admin', role: 'CUSTOMER' });
      const p7adjUser = await prisma.user.findUnique({ where: { email: adminEmail } });
      await rbac.assignRole(p7adjUser!.id, 'SUPER_ADMIN');
      const reg = { tokens: await auth.login({ email: adminEmail, password: 'Passw0rd!23' }) };
      const { paymentId } = await paidBooking('adj', 5);
      const payout = await prisma.payout.findFirst({ where: { reference: `PO_${paymentId}` } });
      const payoutId = payout!.id;
      const before = payout!.totalCents.toString();

      const noReason = await call('POST', `/payments/payouts/${payoutId}/adjustment`, reg.tokens.accessToken, { amountCents: '5000', reason: '' });
      expect(noReason.status).toBe(400);

      const adj = await call('POST', `/payments/payouts/${payoutId}/adjustment`, reg.tokens.accessToken, { amountCents: '5000', reason: 'Goodwill top-up (test)' });
      expect(adj.status).toBe(200);
      expect(adj.body.data.newTotalCents).toBe((BigInt(before) + 5000n).toString());

      const audits = await prisma.auditLog.findMany({ where: { entity: 'payout', entityId: payoutId } });
      expect(audits.map((a) => a.action)).toContain('payout.adjustment');
    });
  });

  describe('secure payout methods', () => {
    it('unapproved providers cannot register payout methods', async () => {
      const prov = await register('PROVIDER', `p7unverified_${Date.now()}@example.com`);
      await call('POST', '/providers/me', prov.accessToken, { businessName: 'Unverified Studio', city: 'Nairobi' });
      const res = await call('POST', '/payments/payouts/methods', prov.accessToken, { type: 'MPESA', detailsRef: '0712345678' });
      expect([403, 404]).toContain(res.status);
    });

    it('rejects full card PANs and secrets, masks references on read', async () => {
      const { prov } = await paidBooking('mask', 6);

      const pan = await call('POST', '/payments/payouts/methods', prov.accessToken, { type: 'BANK', detailsRef: '4111111111111111' });
      expect(pan.status).toBe(400);

      const secret = await call('POST', '/payments/payouts/methods', prov.accessToken, { type: 'MPESA', detailsRef: '0712345678 pin 1234' });
      expect(secret.status).toBe(400);

      const ok = await call('POST', '/payments/payouts/methods', prov.accessToken, { type: 'MPESA', detailsRef: '0722000000' });
      expect(ok.status).toBe(201);

      const list = await call('GET', '/payments/payouts/methods', prov.accessToken);
      expect(list.status).toBe(200);
      const mine = (list.body.data as any[]).find((m: any) => m.id === ok.body.data.id);
      expect(mine.detailsRef).toContain('****');
      expect(mine.detailsRef).not.toBe('0722000000');
    });
  });
});
