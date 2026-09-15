import { Test } from '@nestjs/testing';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { RbacModule } from '../src/modules/rbac/rbac.module';
import { AuditModule } from '../src/modules/audit/audit.module';
import { NotificationModule } from '../src/common/adapters/notification/notification.module';
import { PrismaModule } from '../src/modules/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { LoggingModule } from '../src/common/logging/logging.module';
import { NOTIFICATION_PROVIDER } from '../src/common/adapters/notification/notification.provider';
import { AuthService } from '../src/modules/auth/auth.service';
import { UsersService } from '../src/modules/users/users.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

interface SentMessage {
  to: string;
  body: string;
}

function extractToken(body: string): string {
  const match = body.match(/token=([0-9a-f]+)/);
  if (!match) throw new Error(`No token found in: ${body}`);
  return match[1];
}

describe('Auth flow (integration, real Postgres)', () => {
  let auth: AuthService;
  let users: UsersService;
  let prisma: PrismaService;
  const sent: SentMessage[] = [];

  beforeAll(async () => {
    const capturing = {
      send: async (m: SentMessage) => {
        sent.push(m);
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        LoggingModule,
        AuthModule,
        UsersModule,
        RbacModule,
        AuditModule,
        NotificationModule,
        PrismaModule,
      ],
    })
      .overrideProvider(NOTIFICATION_PROVIDER)
      .useValue(capturing)
      .compile();

    await moduleRef.init();

    auth = moduleRef.get(AuthService);
    users = moduleRef.get(UsersService);
    prisma = moduleRef.get(PrismaService);

    await wipe();
  }, 60000);

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  }, 60000);

  async function wipe(): Promise<void> {
    await prisma.refreshToken.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({});
  }

  it('registers, verifies email, logs in, rotates refresh, and revokes on logout', async () => {
    const email = `it_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'Passw0rd!23';

    const reg = await auth.register({ email, password, name: 'IT User', phone: '+254700000000', role: 'CUSTOMER' });
    expect(reg.user.id).toBeDefined();
    expect(reg.tokens.accessToken).toBeDefined();

    const verifyMsg = sent.find((m) => m.to === email && m.body.includes('verify-email'));
    expect(verifyMsg).toBeDefined();
    await auth.verifyEmail({ token: extractToken(verifyMsg!.body) });

    const verified = await prisma.user.findUnique({ where: { email } });
    expect(verified!.emailVerified).toBe(true);

    const login = await auth.login({ email, password });
    expect(login.accessToken).toBeDefined();
    expect(login.refreshToken).toBeDefined();

    const refreshed = await auth.refresh(login.refreshToken);
    expect(refreshed.accessToken).toBeDefined();
    // Rotation must issue a brand-new refresh token (jti differs).
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);

    // The rotated-away token must be rejected.
    await expect(auth.refresh(login.refreshToken)).rejects.toThrow();

    await auth.logout(refreshed.refreshToken);
    await expect(auth.refresh(refreshed.refreshToken)).rejects.toThrow();

    const roles = await users.getRoles(verified!.id);
    expect(roles).toContain('CUSTOMER');
  });

  it('rejects login with the wrong password', async () => {
    const email = `it2_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    await auth.register({ email, password: 'Passw0rd!23', name: 'X', phone: '+254700000001', role: 'CUSTOMER' });
    await expect(auth.login({ email, password: 'wrong-password' })).rejects.toThrow();
  });

  it('completes the forgot-password / reset-password flow', async () => {
    const email = `it3_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'Passw0rd!23';
    await auth.register({ email, password, name: 'Y', phone: '+254700000002', role: 'CUSTOMER' });

    await auth.forgotPassword({ email });
    const resetMsg = sent.find((m) => m.to === email && m.body.includes('reset-password'));
    expect(resetMsg).toBeDefined();

    await auth.resetPassword({ token: extractToken(resetMsg!.body), password: 'NewPassw0rd!23' });

    // Old password no longer works, new one does.
    await expect(auth.login({ email, password })).rejects.toThrow();
    const login = await auth.login({ email, password: 'NewPassw0rd!23' });
    expect(login.accessToken).toBeDefined();
  });
});
