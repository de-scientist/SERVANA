/**
 * PHASE 17 — negative security guarantees. Each test proves an attacker
 * CANNOT do something: cross-user access, amount forgery, self-awards,
 * secret leakage, or unsigned money moves. These must never regress.
 */
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../modules/rbac/guards/roles.guard';
import { ROLES_KEY } from '../../modules/rbac/guards/roles.guard';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { ThrottlerGuard } from '../guards/throttler.guard';
import { SimulatedPaymentProvider } from '../adapters/payment/simulated-payment.provider';
import { sniffMatches } from '../../modules/providers/providers.service';
import { OrderService } from '../../modules/shop/order.service';
import { CartService } from '../../modules/shop/cart.service';
import { ProvidersService } from '../../modules/providers/providers.service';
import { CommissionService } from '../../modules/payments/commission.service';
import { LoyaltyService } from '../../modules/loyalty/loyalty.service';
import { PaymentService } from '../../modules/payments/payment.service';
import { assertProductionSecrets } from './startup';

class TestProvider extends SimulatedPaymentProvider {
  readonly id = 'testpay';
  readonly name = 'TestPay';
  readonly methods = ['OTHER'] as any;
}

function mockContext(user?: unknown, ip = '1.2.3.4', method = 'GET', url = '/x'): any {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, ip, method, url, headers: user ? {} : {} }),
      getResponse: () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
}

describe('security negatives (Phase 17)', () => {
  // --- authentication ------------------------------------------------------------

  describe('JwtAuthGuard', () => {
    const jwt: any = {
      verify: jest.fn((token: string) => {
        if (token === 'good') return { sub: 'u1', roles: ['CUSTOMER'] };
        throw new Error('bad');
      }),
    };

    it('rejects missing and malformed tokens', () => {
      const guard = new JwtAuthGuard(jwt);
      const noHeader = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }), getHandler: () => ({}), getClass: () => ({}) };
      expect(() => guard.canActivate(noHeader as any)).toThrow(UnauthorizedException);
      const malformed = { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Token abc' } }) }), getHandler: () => ({}), getClass: () => ({}) };
      expect(() => guard.canActivate(malformed as any)).toThrow(UnauthorizedException);
      const forged = { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer forged' }, user: undefined }) }), getHandler: () => ({}), getClass: () => ({}) };
      expect(() => guard.canActivate(forged as any)).toThrow(UnauthorizedException);
    });

    it('accepts a valid token and binds identity', () => {
      const guard = new JwtAuthGuard(jwt);
      const req: any = { headers: { authorization: 'Bearer good' } };
      const ctx = { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => ({}), getClass: () => ({}) };
      expect(guard.canActivate(ctx as any)).toBe(true);
      expect(req.user.sub).toBe('u1');
    });
  });

  // --- authorization ---------------------------------------------------------------

  describe('RolesGuard', () => {
    it('blocks under-privileged roles from admin APIs', () => {
      const reflector = new Reflector();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'SUPER_ADMIN']);
      const guard = new RolesGuard(reflector);
      const ctx = mockContext({ roles: ['CUSTOMER'] });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(ROLES_KEY).toBe('servana:roles');
    });

    it('blocks missing identity and allows sufficient roles', () => {
      const reflector = new Reflector();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const guard = new RolesGuard(reflector);
      expect(() => guard.canActivate(mockContext(undefined))).toThrow(UnauthorizedException);
      expect(guard.canActivate(mockContext({ roles: ['ADMIN'] }))).toBe(true);
    });
  });

  // --- error hygiene ------------------------------------------------------------------

  describe('AllExceptionsFilter', () => {
    function run(exception: unknown) {
      const filter = new AllExceptionsFilter();
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const ctx = {
        switchToHttp: () => ({ getResponse: () => ({ status, json }) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;
      filter.catch(exception, ctx);
      return json.mock.calls[0][0];
    }

    it('sanitizes 500s: no Prisma internals, queries or paths leak', () => {
      const body = run(new Error('Raw query failed: SELECT * FROM "Payment" WHERE id=\'…\' at /app/secret/path'));
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toContain('SELECT');
      expect(JSON.stringify(body)).not.toContain('/app/secret');
    });

    it('preserves hand-rolled 4xx semantics', () => {
      const err: any = new Error('Providers draft for their own profile.');
      err.status = 403;
      const body = run(err);
      expect(body.error.message).toBe('Providers draft for their own profile.');
    });

    it('passes HttpExceptions through untouched', () => {
      const body = run(new BadRequestException('Too small'));
      expect(body.error.message).toBe('Too small');
    });
  });

  // --- rate limiting ---------------------------------------------------------------------

  describe('ThrottlerGuard', () => {
    function guard() {
      const reflector = new Reflector();
      jest.spyOn(reflector, 'get').mockReturnValue(undefined);
      const logger: any = { warn: jest.fn() };
      return new ThrottlerGuard(reflector, logger);
    }

    it('blocks past the limit with 429', () => {
      process.env.RATE_LIMIT_MAX = '3';
      process.env.RATE_LIMIT_WINDOW_MS = '60000';
      const g = guard();
      const ctx = () => mockContext(undefined, '9.9.9.9', 'GET', '/login');
      expect(g.canActivate(ctx())).toBe(true);
      expect(g.canActivate(ctx())).toBe(true);
      expect(g.canActivate(ctx())).toBe(true);
      try {
        g.canActivate(ctx());
        throw new Error('should have throttled');
      } catch (e: any) {
        expect(e.status ?? e.getStatus?.()).toBe(429);
      } finally {
        delete process.env.RATE_LIMIT_MAX;
        delete process.env.RATE_LIMIT_WINDOW_MS;
      }
    });
  });

  // --- payment webhooks ---------------------------------------------------------------------

  describe('webhook signature', () => {
    const OLD = process.env.MPESA_WEBHOOK_SECRET;

    afterEach(() => {
      if (OLD === undefined) delete process.env.MPESA_WEBHOOK_SECRET;
      else process.env.MPESA_WEBHOOK_SECRET = OLD;
    });

    it('rejects unsigned/forged callbacks when a secret is configured', async () => {
      process.env.MPESA_WEBHOOK_SECRET = 's3cret';
      const p = new TestProvider();
      await expect(p.verifyWebhook('{}', undefined)).resolves.toBe(false);
      await expect(p.verifyWebhook('{}', 'forged')).resolves.toBe(false);
      await expect(p.verifyWebhook('{}', 's3cret')).resolves.toBe(true);
    });
  });

  // --- file uploads ----------------------------------------------------------------------------

  describe('upload sniffing', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

    it('accepts genuine files and rejects spoofed mimetypes', () => {
      expect(sniffMatches(png, 'image/png')).toBe(true);
      expect(sniffMatches(jpg, 'image/jpeg')).toBe(true);
      expect(sniffMatches(png, 'image/jpeg')).toBe(false); // PNG bytes as JPEG
      expect(sniffMatches(Buffer.from('<?php evil'), 'image/png')).toBe(false);
      expect(sniffMatches(Buffer.alloc(4), 'image/png')).toBe(false);
    });
  });

  // --- production secrets ---------------------------------------------------------------------------

  describe('bootstrap secrets', () => {
    it('refuses production boot with default/weak secrets', () => {
      expect(() =>
        assertProductionSecrets({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'change_me_access' } as any),
      ).toThrow(/weak\/missing secrets/);
      expect(() =>
        assertProductionSecrets({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'x'.repeat(40), JWT_REFRESH_SECRET: 'y'.repeat(40) } as any),
      ).not.toThrow();
      expect(() => assertProductionSecrets({ NODE_ENV: 'test' } as any)).not.toThrow();
    });
  });

  // --- GUARANTEE 1: no cross-user booking/order access ---------------------------------------------------

  describe('order ownership', () => {
    function orderSvc(order: any) {
      const prisma: any = {
        order: { findUnique: jest.fn().mockResolvedValue(order), findMany: jest.fn(), count: jest.fn() },
      };
      return new OrderService(prisma, { record: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any);
    }

    it('rejects reading another customer’s order', async () => {
      const svc = orderSvc({ id: 'o1', customerId: 'victim', items: [], history: [] });
      await expect(svc.getMine({ sub: 'attacker', role: 'CUSTOMER' }, 'o1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('cart isolation', () => {
    it('cannot touch cart items that are not in your own cart', async () => {
      const prisma: any = {
        cart: {
          findUnique: jest.fn().mockResolvedValue({ id: 'cart-attacker', items: [] }),
          create: jest.fn(),
        },
        cartItem: { deleteMany: jest.fn(), delete: jest.fn(), update: jest.fn() },
      };
      const svc = new CartService(prisma, {} as any);
      const { NotFoundException } = await import('@nestjs/common');
      await expect(svc.setQty({ sub: 'attacker', role: 'CUSTOMER' }, 'victim-item', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // --- GUARANTEE 2: no cross-provider service modification --------------------------------------------------

  describe('provider service ownership', () => {
    function provSvc(profileId: string) {
      const prisma: any = {
        providerProfile: { findUnique: jest.fn().mockResolvedValue({ id: profileId, userId: 'x' }) },
        providerService: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const audit: any = { record: jest.fn() };
      return new ProvidersService(prisma, audit, { warn: jest.fn(), log: jest.fn() } as any, {} as any);
    }

    it('rejects updating another provider’s service', async () => {
      const svc = provSvc('attacker-profile');
      const { NotFoundException } = await import('@nestjs/common');
      await expect(svc.updateService('attacker-user', 'victim-service', { name: 'Hacked' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // --- GUARANTEE 3+4: amounts verified server-side; success never forged ----------------------------------------

  describe('payment integrity', () => {
    function paySvc(tx: any, prismaExtra: any = {}) {
      const prisma: any = {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
        booking: { findUnique: jest.fn(), update: jest.fn() },
        bookingStatusHistory: { create: jest.fn() },
        ...prismaExtra,
      };
      const gateway: any = {
        get: jest.fn(),
        getById: jest.fn().mockReturnValue({ id: 'mpesa' }),
      };
      const commission: any = { compute: jest.fn() };
      const loyalty: any = { earnFromPayment: jest.fn() };
      const notifications: any = { notify: jest.fn() };
      return new PaymentService(prisma, gateway, commission, loyalty, notifications);
    }

    it('marks amount-mismatched webhooks FAILED (amounts cannot be altered)', async () => {
      const tx: any = {
        payment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pay1', bookingId: 'b1', status: 'PENDING', grossCents: 200000n, currency: 'KES',
          }),
          update: jest.fn(),
        },
        booking: { update: jest.fn() },
      };
      const svc = paySvc(tx);
      // setBookingStatus uses this.prisma — covered by prisma.booking mocks via $transaction? No:
      // handleProviderEvent calls setBookingStatus → this.prisma.booking.findUnique. Provide it:
      (svc as any).prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: 'PENDING' });

      const out: any = await svc.handleProviderEvent('mpesa', {
        providerRef: 'r1', status: 'SUCCESSFUL', amount: '100000', currency: 'KES',
      });
      expect(out.amountMismatch).toBe(true);
      expect(tx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('initiation never creates SUCCESSFUL payments (success cannot be forged)', async () => {
      const prisma: any = {
        booking: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'b1', customerId: 'cust1', status: 'PENDING', priceCents: 200000n, currency: 'KES',
            providerService: { provider: { id: 'prov1', status: 'VERIFIED' } },
          }),
        },
        payment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'pay1' }) },
        bookingStatusHistory: { create: jest.fn() },
      };
      const gateway: any = {
        get: jest.fn().mockReturnValue({ id: 'mpesa', initiate: jest.fn().mockResolvedValue({ providerRef: 'r' }) }),
        getById: jest.fn(),
      };
      const svc = new PaymentService(prisma, gateway, { compute: jest.fn() } as any, {} as any, { notify: jest.fn() } as any);
      (svc as any).mapPayment = jest.fn().mockReturnValue({ id: 'pay1', status: 'PENDING' });
      // Stub the post-create booking updates.
      prisma.booking.update = jest.fn();

      const out: any = await svc.initiate({ sub: 'cust1', role: 'CUSTOMER' }, { bookingId: 'b1' });
      expect(out.status).toBe('PENDING');
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
      );
    });
  });

  // --- GUARANTEE 5: commissions immutable except via SUPER_ADMIN -----------------------------------------------

  describe('commission immutability', () => {
    it('rejects modification and deletion of the standard rule', async () => {
      const prisma: any = {
        commissionRule: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      };
      // CommissionService constructor takes prisma only (logger is internal).
      const svc = new CommissionService(prisma);
      await expect(svc.updateRule('standard', { value: 1 } as any)).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.deleteRule('standard')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // --- GUARANTEE 6: no self-awarded loyalty ----------------------------------------------------------------------

  describe('loyalty self-award', () => {
    it('ignores client-supplied points: awards come from server rules only', async () => {
      const db: any = {
        loyaltyRule: {
          findMany: jest.fn().mockResolvedValue([
            { event: 'BOOKING' }, { event: 'REVIEW' }, { event: 'REFERRAL' },
            { event: 'PURCHASE' }, { event: 'SIGNUP' },
          ]),
          findUnique: jest.fn().mockResolvedValue({ event: 'BOOKING', points: 20, active: true }),
          create: jest.fn(),
        },
        loyaltyTier: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
        customerProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof1' }) },
        loyaltyAccount: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'acc1', balanceCents: 0n }),
          update: jest.fn().mockResolvedValue({ id: 'acc1', balanceCents: 20n }),
        },
        loyaltyTransaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'lt1', ...data })),
        },
      };
      const svc = new LoyaltyService(db, { record: jest.fn() } as any, { notify: jest.fn() } as any, undefined);
      const out: any = await svc.earn(db, {
        userId: 'attacker',
        event: 'BOOKING',
        refType: 'PAYMENT',
        refId: 'pay1',
        // An attacker cannot smuggle points: earn() accepts no points field.
        reason: 'trust me, 1000000 points',
      } as any);
      expect(out.transaction.deltaCents).toBe(20n);
    });
  });

  // --- GUARANTEE 7+8: reviews + verification documents ------------------------------------------------------------------

  describe('public profile exposure', () => {
    it('excludes verification documents, owner contacts and precise location', async () => {
      const profile = {
        id: 'p1', businessName: 'B', slug: 'b', tagline: null, bio: null, city: 'Nairobi', country: 'Kenya',
        status: 'VERIFIED',
        address: { street: 'Secret St 1' }, lat: -1.292, lng: 36.821, travelToCustomer: false,
        serviceRadiusKm: null, websiteUrl: null, businessPhone: '+254700000000', yearsExperience: null,
        languages: [], socialLinks: null, workingPreferences: null,
        categories: [], services: [], portfolio: [],
        verification: { status: 'VERIFIED', level: 'BASIC', verifiedAt: null },
        user: { name: 'Owner', profileImage: null },
      };
      const prisma: any = {
        providerProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
        review: { findMany: jest.fn().mockResolvedValue([]) },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const svc = new ProvidersService(
        prisma, { record: jest.fn() } as any, { warn: jest.fn(), log: jest.fn() } as any, {} as any,
      );
      const out: any = await svc.getPublicProfile('b');
      const json = JSON.stringify(out);
      expect(out).not.toHaveProperty('businessPhone');
      expect(out).not.toHaveProperty('lat');
      expect(out).not.toHaveProperty('lng');
      expect(out).not.toHaveProperty('location');
      expect(json).not.toContain('Secret St');
      expect(json).not.toContain('+254700000000');
      expect(json).not.toContain('documents');
      expect(json).not.toContain('storageKey');
    });
  });
});
