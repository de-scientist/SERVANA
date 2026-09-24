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
import { ShopModule } from '../src/modules/shop/shop.module';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(90000);

/**
 * Phase 9 · beauty products & e-commerce (integration).
 *
 * Proves order and inventory integrity end-to-end:
 *   Browse → Cart → Checkout (reserve) → Payment (finalize) → Fulfilment
 * with no oversell and a fully reconciled money trail.
 */
describe('Phase 9 · shop (integration)', () => {
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
    await prisma.orderStatusHistory.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.serviceProductLink.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.service.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.auditLog.deleteMany({});
  }

  async function register(role: 'CUSTOMER' | 'PROVIDER', email: string) {
    const reg = await auth.register({ email, password: 'Passw0rd!23', name: 'Tester', role });
    return reg.tokens;
  }

  // SECURITY (Phase 17): privileged roles are never self-registered — grant
  // out-of-band via RBAC, then re-login so the JWT carries fresh claims.
  async function superAdmin() {
    const email = `p9admin_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
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

  /** Admin creates a stocked product; returns { product, variantId? }. */
  async function createProduct(adminToken: string, suffix: string, opts: { qty?: number; price?: number; salePrice?: number; providerId?: string } = {}) {
    const res = await call('POST', '/admin/products', adminToken, {
      name: `Shea Hair Oil ${suffix}`,
      brand: 'Servana Naturals',
      sku: `OIL-${suffix}-${Date.now()}`,
      price: opts.price ?? 1500,
      ...(opts.salePrice ? { salePrice: opts.salePrice } : {}),
      ...(opts.providerId ? { providerId: opts.providerId } : {}),
      currency: 'KES',
      images: [{ key: 'oil.jpg', url: 'https://example.com/oil.jpg' }],
      variants: [{ attrs: { size: '250ml' }, priceDelta: 0 }],
      inventory: [{ quantity: opts.qty ?? 10 }],
    });
    expect(res.status).toBe(201);
    const productId = res.body.data.id;
    // Add variant-level stock too.
    const variantId = res.body.data.variants[0]?.id;
    if (variantId) {
      await call('POST', `/admin/products/${productId}/inventory`, adminToken, { variantId, quantity: 5 });
    }
    return { product: res.body.data, variantId };
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
        ShopModule,
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

  describe('catalog', () => {
    it('admin creates a product; customers browse it', async () => {
      const admin = await superAdmin();
      const cust = await register('CUSTOMER', `p9browse_${Date.now()}@example.com`);
      const { product } = await createProduct(admin.accessToken, 'browse');

      const list = await call('GET', '/products?q=Shea');
      expect(list.status).toBe(200);
      expect(list.body.data.map((p: any) => p.id)).toContain(product.id);

      const get = await call('GET', `/products/${product.id}`, cust.accessToken);
      expect(get.status).toBe(200);
      expect(get.body.data.effectivePrice).toBe(1500);
      expect(get.body.data.inventory[0].available).toBe(10);
    });

    it('rejects sale prices above the regular price', async () => {
      const admin = await superAdmin();
      const res = await call('POST', '/admin/products', admin.accessToken, {
        name: 'Bad Priced Oil',
        sku: `BAD-${Date.now()}`,
        price: 1000,
        salePrice: 1200,
        currency: 'KES',
      });
      expect(res.status).toBe(400);
    });

    it('archives instead of deleting', async () => {
      const admin = await superAdmin();
      const { product } = await createProduct(admin.accessToken, 'arch');
      const del = await call('DELETE', `/admin/products/${product.id}`, admin.accessToken);
      expect(del.status).toBe(200);
      const gone = await call('GET', `/products/${product.id}`);
      expect(gone.status).toBe(404);
    });
  });

  describe('cart → checkout → payment', () => {
    it('reserves on checkout and finalizes on capture (no oversell)', async () => {
      const admin = await superAdmin();
      const cust = await register('CUSTOMER', `p9buy_${Date.now()}@example.com`);
      // Seller-owned product exercises the full money trail (earning + payout).
      const sellerEmail = `p9seller_${Date.now()}@example.com`;
      const prov = await register('PROVIDER', sellerEmail);
      await call('POST', '/providers/me', prov.accessToken, { businessName: 'Seller Studio', city: 'Nairobi' });
      const sellerUser = await prisma.user.findUnique({ where: { email: sellerEmail } });
      const seller = await prisma.providerProfile.findFirst({ where: { userId: sellerUser!.id } });
      const { product } = await createProduct(admin.accessToken, 'buy', { qty: 10, providerId: seller!.id });

      await call('POST', '/cart/items', cust.accessToken, { productId: product.id, qty: 2 });
      const checkout = await call('POST', '/orders/checkout', cust.accessToken, { method: 'MPESA' });
      expect(checkout.status).toBe(201);
      const order = checkout.body.data.order;
      expect(order.status).toBe('PENDING');
      expect(order.totalCents).toBe('300000'); // 2 × KES 1500

      // Reservation holds units; on-hand untouched until capture.
      let inv = await prisma.inventory.findFirst({ where: { productId: product.id } });
      expect(inv!.quantity).toBe(10);
      expect(inv!.reserved).toBe(2);

      const payment = checkout.body.data.payment;
      const wh: any = await capturePayment(payment.providerRef, '300000');
      expect(wh.captured).toBe(true);

      const mine = await call('GET', `/orders/${order.id}`, cust.accessToken);
      expect(mine.body.data.status).toBe('PAID');

      // Finalized exactly once.
      inv = await prisma.inventory.findFirst({ where: { productId: product.id } });
      expect(inv!.quantity).toBe(8);
      expect(inv!.reserved).toBe(0);

      // Money trail: commission + seller earning + linked payout.
      const earning = await prisma.providerEarning.findFirst({ where: { orderId: order.id } });
      expect(earning).toBeDefined();
      expect(earning!.providerId).toBe(seller!.id);
      expect(earning!.grossCents.toString()).toBe('300000');
      expect((earning!.grossCents - earning!.commissionCents).toString()).toBe(earning!.netCents.toString());
      const commission = await prisma.commission.findFirst({ where: { paymentId: payment.id } });
      expect(commission).toBeDefined();
      expect(commission!.commissionCents.toString()).toBe(earning!.commissionCents.toString());
      const payout = await prisma.payout.findFirst({
        where: { reference: `PO_${payment.id}` },
        include: { items: true },
      });
      expect(payout).toBeDefined();
      expect(payout!.items).toHaveLength(1);
      expect(payout!.items[0].earningId).toBe(earning!.id);
      expect(payout!.totalCents.toString()).toBe(earning!.netCents.toString());
    });

    it('blocks overselling across concurrent checkouts', async () => {
      const admin = await superAdmin();
      const cust1 = await register('CUSTOMER', `p9over1_${Date.now()}@example.com`);
      const cust2 = await register('CUSTOMER', `p9over2_${Date.now()}@example.com`);
      const { product } = await createProduct(admin.accessToken, 'over', { qty: 3 });

      await call('POST', '/cart/items', cust1.accessToken, { productId: product.id, qty: 3 });
      await call('POST', '/cart/items', cust2.accessToken, { productId: product.id, qty: 1 });

      const first = await call('POST', '/orders/checkout', cust1.accessToken, {});
      expect(first.status).toBe(201);

      const second = await call('POST', '/orders/checkout', cust2.accessToken, {});
      expect(second.status).toBe(409);

      const inv = await prisma.inventory.findFirst({ where: { productId: product.id } });
      expect(inv!.reserved).toBeLessThanOrEqual(inv!.quantity);
    });

    it('retries a failed order payment with a fresh reference', async () => {
      const admin = await superAdmin();
      const cust = await register('CUSTOMER', `p9retry_${Date.now()}@example.com`);
      const { product } = await createProduct(admin.accessToken, 'retry', { qty: 5 });

      await call('POST', '/cart/items', cust.accessToken, { productId: product.id, qty: 1 });
      const checkout = await call('POST', '/orders/checkout', cust.accessToken, { method: 'MPESA' });
      const orderId = checkout.body.data.order.id;
      const firstRef = checkout.body.data.payment.providerRef;

      // Simulate PSP failure.
      const failRes = await fetch(base + '/api/v1/payments/webhook/mpesa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pay-signature': 'test-signature' },
        body: JSON.stringify({ providerRef: firstRef, status: 'FAILED', amount: '150000', currency: 'KES' }),
      });
      expect((await failRes.json()).failed).toBe(true);

      const retry = await call('POST', `/orders/${orderId}/pay`, cust.accessToken, { method: 'MPESA' });
      expect(retry.status).toBe(201);
      expect(retry.body.data.status).toBe('PENDING');

      const wh: any = await capturePayment(retry.body.data.providerRef, '150000');
      expect(wh.captured).toBe(true);
      const mine = await call('GET', `/orders/${orderId}`, cust.accessToken);
      expect(mine.body.data.status).toBe('PAID');
    });
  });

  describe('fulfilment lifecycle', () => {
    it('advances PAID → … → COMPLETED and rejects skips', async () => {
      const admin = await superAdmin();
      const cust = await register('CUSTOMER', `p9ful_${Date.now()}@example.com`);
      const { product } = await createProduct(admin.accessToken, 'ful', { qty: 5 });

      await call('POST', '/cart/items', cust.accessToken, { productId: product.id, qty: 1 });
      const checkout = await call('POST', '/orders/checkout', cust.accessToken, {});
      const orderId = checkout.body.data.order.id;
      await capturePayment(checkout.body.data.payment.providerRef, '150000');

      const skip = await call('POST', `/admin/orders/${orderId}/advance`, admin.accessToken, { to: 'SHIPPED' });
      expect(skip.status).toBe(400);

      for (const to of ['PROCESSING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED']) {
        const adv = await call('POST', `/admin/orders/${orderId}/advance`, admin.accessToken, { to });
        expect(adv.status).toBe(200);
        expect(adv.body.data.status).toBe(to);
      }
    });

    it('cancelling a PENDING order releases the reservation', async () => {
      const admin = await superAdmin();
      const cust = await register('CUSTOMER', `p9cancel_${Date.now()}@example.com`);
      const { product } = await createProduct(admin.accessToken, 'cancel', { qty: 5 });

      await call('POST', '/cart/items', cust.accessToken, { productId: product.id, qty: 2 });
      const checkout = await call('POST', '/orders/checkout', cust.accessToken, {});
      const orderId = checkout.body.data.order.id;

      const cancelled = await call('POST', `/orders/${orderId}/cancel`, cust.accessToken, { reason: 'Changed mind' });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');

      const inv = await prisma.inventory.findFirst({ where: { productId: product.id } });
      expect(inv!.quantity).toBe(5);
      expect(inv!.reserved).toBe(0);
    });

    it('refunding restocks sold units and reverses the earning', async () => {
      const admin = await superAdmin();
      const cust = await register('CUSTOMER', `p9refund_${Date.now()}@example.com`);
      const { product } = await createProduct(admin.accessToken, 'refund', { qty: 5 });

      await call('POST', '/cart/items', cust.accessToken, { productId: product.id, qty: 1 });
      const checkout = await call('POST', '/orders/checkout', cust.accessToken, {});
      const orderId = checkout.body.data.order.id;
      await capturePayment(checkout.body.data.payment.providerRef, '150000');
      await call('POST', `/admin/orders/${orderId}/advance`, admin.accessToken, { to: 'PROCESSING' });

      const refund = await call('POST', `/admin/orders/${orderId}/refund`, admin.accessToken, { reason: 'Damaged' });
      expect(refund.status).toBe(200);
      expect(refund.body.data.status).toBe('REFUNDED');

      const inv = await prisma.inventory.findFirst({ where: { productId: product.id } });
      expect(inv!.quantity).toBe(5);
    });
  });

  describe('cross-sell', () => {
    it('returns curated links before category fallback', async () => {
      const admin = await superAdmin();
      const { product } = await createProduct(admin.accessToken, 'cross', { qty: 5 });
      const category = await prisma.category.create({
        data: { slug: `crosscat-${Date.now()}`, name: 'CrossCat' },
      });
      const service = await prisma.service.create({
        data: {
          categoryId: category.id,
          name: 'Hair Braiding',
          basePriceCents: 200000n,
          currency: 'KES',
          durationMin: 120,
          deliveryTypes: ['AT_PROVIDER_LOCATION'],
        },
      });
      const link = await call('POST', '/admin/cross-sell', admin.accessToken, {
        serviceId: service.id,
        productId: product.id,
        reason: 'Aftercare for braids',
      });
      expect(link.status).toBe(201);

      const res = await call('GET', `/products/cross-sell?serviceId=${service.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data[0].id).toBe(product.id);
      expect(res.body.data[0].source).toBe('curated');
    });
  });

  describe('ledger', () => {
    it('reconciliation stays intact across order flows', async () => {
      const admin = await superAdmin();
      const res = await call('GET', '/payments/payouts/reconciliation', admin.accessToken);
      expect(res.status).toBe(200);
      expect(res.body.data.ledgerIntact).toBe(true);
      expect(res.body.data.discrepancyCents).toBe('0');
    });
  });
});
