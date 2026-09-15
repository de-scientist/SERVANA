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
import { CategoriesModule } from '../src/modules/categories/categories.module';
import { AvailabilityModule } from '../src/modules/availability/availability.module';
import { SearchModule } from '../src/modules/search/search.module';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/modules/rbac/rbac.service';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh';

jest.setTimeout(30000);

describe('Phase 4 · search, categories & availability (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let rbac: RbacService;
  let base: string;

  async function wipe(): Promise<void> {
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
    const prov = await prisma.user.findUnique({ where: { email } });
    const profile = await prisma.providerProfile.findFirst({ where: { userId: prov!.id } });
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

  function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
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
        CategoriesModule,
        AvailabilityModule,
        SearchModule,
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

  it('admin can create a category taxonomy and it is public', async () => {
    const adminEmail = `admin_${Date.now()}@example.com`;
    await register('CUSTOMER', adminEmail);
    const admin = await promoteAdmin(adminEmail);

    const top = await call('POST', '/admin/categories', admin.accessToken, { name: 'Hair' });
    expect(top.status).toBe(201);
    const sub = await call('POST', '/admin/categories', admin.accessToken, {
      name: 'Box Braids',
      parentId: top.body.id,
    });
    expect(sub.status).toBe(201);

    const tree = await call('GET', '/categories');
    expect(tree.status).toBe(200);
    const root = tree.body.find((c: any) => c.name === 'Hair');
    expect(root).toBeDefined();
    expect(root.children.length).toBe(1);
    expect(root.children[0].name).toBe('Box Braids');
  });

  it('searches services and providers by query, category and price', async () => {
    const email = `prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', email);
    await call('POST', '/providers/me', prov.accessToken, {
      businessName: 'Glow Up Studio',
      city: 'Nairobi',
      country: 'Kenya',
    });
    const cat = await prisma.category.create({ data: { slug: 'nails-' + Date.now(), name: 'Nails' } });
    await call('PUT', '/providers/me/categories', prov.accessToken, { categoryIds: [cat.id] });
    const svc = await call('POST', '/providers/me/services', prov.accessToken, {
      categoryId: cat.id,
      name: 'Gel Manicure',
      description: 'Long lasting gel',
      price: 2000,
      durationMin: 60,
      deliveryTypes: ['AT_PROVIDER_LOCATION'],
      isActive: true,
    });
    expect(svc.status).toBe(201);

    // Not verified yet → should not appear in search
    const hidden = await call('GET', '/search?q=gel');
    expect(hidden.body.services.length).toBe(0);

    // Verify provider
    await call('POST', '/providers/me/verification/submit', prov.accessToken, { notes: 'docs' });
    const adminEmail = `admin2_${Date.now()}@example.com`;
    await register('CUSTOMER', adminEmail);
    const admin = await promoteAdmin(adminEmail);
    const profile = await prisma.providerProfile.findFirst({ where: { userId: (await prisma.user.findUnique({ where: { email } }))!.id } });
    await call('POST', `/admin/verifications/${profile!.id}/review`, admin.accessToken, { decision: 'APPROVE', level: 'PROFESSIONAL_VERIFIED' });

    const byQ = await call('GET', '/search?q=gel');
    expect(byQ.body.services.length).toBe(1);
    expect(byQ.body.services[0].name).toBe('Gel Manicure');

    const byCat = await call('GET', `/search?categoryId=${cat.id}`);
    expect(byCat.body.services.length).toBe(1);

    const byProvider = await call('GET', '/search?q=Glow');
    expect(byProvider.body.providers.length).toBe(1);
    expect(byProvider.body.providers[0].verified).toBe(true);

    const priceFiltered = await call('GET', '/search?minPrice=300000');
    expect(priceFiltered.body.services.length).toBe(0);
  });

  it('generates available slots and prevents impossible slots', async () => {
    const email = `prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', email);
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Slot Studio', city: 'Nairobi' });
    const cat = await prisma.category.create({ data: { slug: 'massage-' + Date.now(), name: 'Massage' } });
    const svc = await call('POST', '/providers/me/services', prov.accessToken, {
      categoryId: cat.id,
      name: 'Swedish Massage',
      price: 3000,
      durationMin: 90,
      bufferMin: 15,
      bookingWindowDays: 14,
      deliveryTypes: ['AT_PROVIDER_LOCATION'],
      isActive: true,
    });
    const serviceId = svc.body.data.id;

    await verifyProvider(email);

    const dow = new Date().getUTCDay();
    const set = await call('PUT', '/providers/me/availability', prov.accessToken, {
      rules: [
        { dayOfWeek: dow, startMin: 9 * 60, endMin: 17 * 60, breakStart: 12 * 60, breakEnd: 13 * 60 },
      ],
      exceptions: [],
    });
    expect(set.status).toBe(200);

    const profile = await prisma.providerProfile.findFirst({ where: { userId: (await prisma.user.findUnique({ where: { email } }))!.id } });
    const slots = await call('GET', `/providers/${profile!.slug}/availability?serviceId=${serviceId}&date=${todayUtc()}&days=1`);
    expect(slots.status).toBe(200);
    const day = slots.body[0];
    expect(Array.isArray(day.slots)).toBe(true);

    // No slot should overlap the 12:00–13:00 break.
    const overlappingBreak = day.slots.some((iso: string) => {
      const start = new Date(iso).getUTCHours() * 60 + new Date(iso).getUTCMinutes();
      const end = start + 90;
      return start < 13 * 60 && end > 12 * 60;
    });
    expect(overlappingBreak).toBe(false);

    // No slot should end after close (17:00) given duration 90 + buffer 15 = 105.
    const afterClose = day.slots.some((iso: string) => {
      const start = new Date(iso).getUTCHours() * 60 + new Date(iso).getUTCMinutes();
      return start + 90 + 15 > 17 * 60;
    });
    expect(afterClose).toBe(false);

    // TIME_OFF closes the day.
    await call('PUT', '/providers/me/availability', prov.accessToken, {
      rules: [{ dayOfWeek: dow, startMin: 9 * 60, endMin: 17 * 60 }],
      exceptions: [{ date: todayUtc(), type: 'TIME_OFF' }],
    });
    const closed = await call('GET', `/providers/${profile!.slug}/availability?serviceId=${serviceId}&date=${todayUtc()}&days=1`);
    expect(closed.body[0].slots.length).toBe(0);
  });

  it('exposes a public single service endpoint', async () => {
    const email = `prov_${Date.now()}@example.com`;
    const prov = await register('PROVIDER', email);
    await call('POST', '/providers/me', prov.accessToken, { businessName: 'Single Svc', city: 'Nairobi' });
    const cat = await prisma.category.create({ data: { slug: 'barber-' + Date.now(), name: 'Barber' } });
    const svc = await call('POST', '/providers/me/services', prov.accessToken, {
      categoryId: cat.id,
      name: 'Skin Fade',
      price: 1500,
      durationMin: 45,
      deliveryTypes: ['AT_PROVIDER_LOCATION'],
      isActive: true,
    });
    const id = svc.body.data.id;
    await verifyProvider(email);
    const res = await call('GET', `/services/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Skin Fade');
    expect(res.body.provider.slug).toBeDefined();
  });
});
