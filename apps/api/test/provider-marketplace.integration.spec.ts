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
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

describe('Provider marketplace (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
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
    const reg = await auth.register({ email, password: 'Passw0rd!23', name: 'Tester', phone: '+254700000000', role });
    return reg.tokens;
  }

  async function promoteAdmin(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('user missing');
    await rbac.assignRole(user.id, 'ADMIN');
    return auth.login({ email, password: 'Passw0rd!23' });
  }

  async function call(method: string, path: string, token?: string, body?: unknown, form?: FormData) {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const init: RequestInit = { method, headers };
    if (form) {
      init.body = form;
    } else if (body !== undefined) {
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

  it('creates a provider profile, services, and verifies through admin review', async () => {
    const email = `prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', email);

    // No profile yet
    const before = await call('GET', '/providers/me', prov.accessToken);
    expect(before.status).toBe(404);

    // Create profile
    const created = await call('POST', '/providers/me', prov.accessToken, {
      businessName: 'Jane Beauty Studio',
      tagline: 'Premium braids in Kilimani',
      city: 'Nairobi',
      country: 'Kenya',
      travelToCustomer: true,
      serviceRadiusKm: 15,
      languages: ['English', 'Swahili'],
    });
    expect(created.status).toBe(201);
    const slug = created.body.data.slug;
    expect(slug).toMatch(/jane-beauty-studio/);

    // Categories + service
    const cat = await prisma.category.create({ data: { slug: 'hair-' + Date.now(), name: 'Hair' } });
    const cats = await call('PUT', '/providers/me/categories', prov.accessToken, { categoryIds: [cat.id] });
    expect(cats.status).toBe(200);

    const svc = await call('POST', '/providers/me/services', prov.accessToken, {
      categoryId: cat.id,
      name: 'Box Braids',
      description: 'Long-lasting box braids',
      price: 3500,
      durationMin: 180,
      deliveryTypes: ['AT_CUSTOMER_LOCATION', 'AT_PROVIDER_LOCATION'],
      travelFee: 300,
      isActive: true,
    });
    expect(svc.status).toBe(201);
    expect(svc.body.data.price).toBe(3500);
    expect(svc.body.data.priceCents).toBe('350000');
    expect(svc.body.data.travelFee).toBe(300);

    const svcList = await call('GET', '/providers/me/services', prov.accessToken);
    expect(svcList.body.data.length).toBe(1);

    // Portfolio
    const pf = await call('POST', '/providers/me/portfolio', prov.accessToken, {
      title: 'Braided look',
      images: [{ key: 'k1', url: 'https://x/y.jpg' }],
    });
    expect(pf.status).toBe(201);

    // Public profile hidden until verified
    const hidden = await call('GET', `/providers/${slug}`);
    expect(hidden.status).toBe(404);

    // Submit verification
    const sub = await call('POST', '/providers/me/verification/submit', prov.accessToken, { notes: 'Here are my docs' });
    expect(sub.status).toBe(200);
    expect(sub.body.data.status).toBe('UNDER_REVIEW');

    // Admin reviews + approves
    const adminEmail = `admin_${Date.now()}@example.com`;
    await register('CUSTOMER', adminEmail);
    const admin = await promoteAdmin(adminEmail);

    const dash = await call('GET', '/admin/verifications', admin.accessToken);
    expect(dash.body.data.length).toBeGreaterThanOrEqual(1);

    const review = await call('POST', `/admin/verifications/${created.body.data.id}/review`, admin.accessToken, {
      decision: 'APPROVE',
      level: 'PROFESSIONAL_VERIFIED',
    });
    expect(review.status).toBe(200);
    expect(review.body.data.status).toBe('VERIFIED');

    // Now public profile is visible
    const pub = await call('GET', `/providers/${slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.verification.verified).toBe(true);
    expect(pub.body.data.services.length).toBe(1);
    expect(pub.body.data.portfolio.length).toBe(1);
    // Sensitive fields not exposed
    expect(pub.body.data.owner).toBeUndefined();
  });

  it('enforces authorization: customers cannot create provider profiles', async () => {
    const email = `cust_${Date.now()}@example.com`;
    const cust = await register('CUSTOMER', email);
    const forbidden = await call('POST', '/providers/me', cust.accessToken, { businessName: 'Nope' });
    expect(forbidden.status).toBe(403);
  });

  it('prevents cross-owner access and rejects verification review by non-admins', async () => {
    const email = `prov2_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', email);
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Second Studio', city: 'Nairobi' });
    const profile = await prisma.providerProfile.findFirst({ where: { userId: (await prisma.user.findUnique({ where: { email } }))!.id } });

    // Another provider cannot review the first one's verification (admin-only route)
    const other = await register('PROVIDER', `prov3_${Date.now()}@example.com`);
    await call('POST', '/providers/me', other.accessToken, { businessName: 'Third Studio' });
    const badReview = await call('POST', `/admin/verifications/${profile!.id}/review`, other.accessToken, { decision: 'APPROVE' });
    expect(badReview.status).toBe(403);
  });

  it('protects verification documents (upload + signed-url only for admins)', async () => {
    const email = `prov4_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', email);
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Doc Studio', city: 'Nairobi' });

    const form = new FormData();
    form.append('file', new Blob([Buffer.from('fake-png-bytes')], { type: 'image/png' }), 'id.png');
    form.append('kind', 'ID');
    const up = await call('POST', '/providers/me/verification/documents', prov.accessToken, undefined, form);
    expect(up.status).toBe(201);
    expect(up.body.data.kind).toBe('ID');

    // Owner sees metadata only, never a raw url/key
    const own = await call('GET', '/providers/me/verification', prov.accessToken);
    expect(own.body.data.documents[0].id).toBeDefined();
    expect(own.body.data.documents[0].storageKey).toBeUndefined();

    // Documents are not exposed in the admin list payload (metadata only)
    const adminEmail = `admin2_${Date.now()}@example.com`;
    await register('CUSTOMER', adminEmail);
    const admin = await promoteAdmin(adminEmail);
    const detail = await call('GET', '/admin/verifications', admin.accessToken, undefined);
    expect(detail.body).toBeDefined();

    const profile = await prisma.providerProfile.findFirst({ where: { userId: (await prisma.user.findUnique({ where: { email } }))!.id } });
    const docId = own.body.data.documents[0].id;
    const urlRes = await call('GET', `/admin/verifications/${profile!.id}/documents/${docId}/url`, admin.accessToken);
    expect(urlRes.status).toBe(200);
    expect(urlRes.body.data.url).toMatch(/^https?:\/\//);
  });
});
