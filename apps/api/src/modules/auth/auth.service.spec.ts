import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { hashToken } from '../../common/security/tokens';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    role: { findUnique: jest.fn(), upsert: jest.fn() },
    userRole: { upsert: jest.fn() },
    permission: { upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  } as any;
}

function makeUsers() {
  return {
    create: jest.fn(),
    findByEmail: jest.fn(),
    getRoles: jest.fn().mockResolvedValue(['CUSTOMER']),
    changePassword: jest.fn(),
    changeEmail: jest.fn(),
  } as any;
}

const rbac = { assignRole: jest.fn().mockResolvedValue(undefined), getRoles: jest.fn().mockResolvedValue(['CUSTOMER']) } as any;
const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
const notifications = { send: jest.fn().mockResolvedValue({ delivered: true }) } as any;
const jwt = { sign: jest.fn().mockReturnValue('signed-token'), verify: jest.fn() } as any;

function service(prisma: any, users: any) {
  return new AuthService(users, prisma, jwt, rbac, audit, notifications);
}

describe('AuthService', () => {
  it('registers a valid user, assigns CUSTOMER role, stores verify token, sends email', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    users.create.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    const auth = service(prisma, users);

    const res = await auth.register({ name: 'Ada', email: 'a@b.com', password: 'Password1', role: 'CUSTOMER' });

    expect(users.create).toHaveBeenCalledWith('a@b.com', expect.any(String), 'Ada', undefined);
    expect(rbac.assignRole).toHaveBeenCalledWith('u1', 'CUSTOMER');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ emailVerifyToken: expect.any(String), emailVerifyExpires: expect.any(Date) }),
      }),
    );
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com', templateKey: 'email.verify' }));
    expect(res.tokens.accessToken).toBe('signed-token');
    expect(res.user.id).toBe('u1');
  });

  it('assigns PROVIDER too when requested', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    users.create.mockResolvedValue({ id: 'u2', email: 'p@b.com' });
    const auth = service(prisma, users);

    await auth.register({ name: 'Pro', email: 'p@b.com', password: 'Password1', role: 'PROVIDER' });

    expect(rbac.assignRole).toHaveBeenCalledWith('u2', 'CUSTOMER');
    expect(rbac.assignRole).toHaveBeenCalledWith('u2', 'PROVIDER');
  });

  it('rejects duplicate email', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    users.create.mockRejectedValue(new ConflictException('Email already registered'));
    const auth = service(prisma, users);

    await expect(auth.register({ name: 'A', email: 'a@b.com', password: 'Password1', role: 'CUSTOMER' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('login throws UnauthorizedException when user missing', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    users.findByEmail.mockResolvedValue(null);
    const auth = service(prisma, users);

    await expect(auth.login({ email: 'x@b.com', password: 'Password1' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login throws UnauthorizedException on wrong password', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      passwordHash: await bcrypt.hash('Password1', 10),
      roles: [{ role: { name: 'CUSTOMER' } }],
    });
    const auth = service(prisma, users);

    await expect(auth.login({ email: 'a@b.com', password: 'WrongPass9' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login succeeds and returns tokens', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      passwordHash: await bcrypt.hash('Password1', 10),
      roles: [{ role: { name: 'CUSTOMER' } }],
    });
    const auth = service(prisma, users);

    const tokens = await auth.login({ email: 'a@b.com', password: 'Password1' });
    expect(tokens.accessToken).toBe('signed-token');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login' }));
  });

  it('refresh revokes the old token and issues a new pair', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    prisma.refreshToken.findFirst.mockResolvedValue({ id: 'rt1', userId: 'u1', expiresAt: new Date(Date.now() + 60000), revoked: false });
    jwt.verify.mockReturnValue({ sub: 'u1', email: 'a@b.com' });
    const auth = service(prisma, users);

    const tokens = await auth.refresh('raw-refresh');
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({ where: { id: 'rt1' }, data: { revoked: true } });
    expect(tokens.accessToken).toBe('signed-token');
  });

  it('refresh rejects an expired token', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    prisma.refreshToken.findFirst.mockResolvedValue({ id: 'rt1', userId: 'u1', expiresAt: new Date(Date.now() - 1000), revoked: false });
    jwt.verify.mockReturnValue({ sub: 'u1', email: 'a@b.com' });
    const auth = service(prisma, users);

    await expect(auth.refresh('raw-refresh')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('forgot-password stores a reset token and never reveals absence', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    users.findByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    const auth = service(prisma, users);

    await auth.forgotPassword({ email: 'a@b.com' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ passwordResetToken: expect.any(String) }) }),
    );

    // Unknown email → no throw, no update.
    users.findByEmail.mockResolvedValue(null);
    await auth.forgotPassword({ email: 'ghost@b.com' });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('reset-password updates password and revokes all sessions', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    const raw = 'reset-token';
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      passwordResetToken: hashToken(raw),
      passwordResetExpires: new Date(Date.now() + 60000),
    });
    const auth = service(prisma, users);

    await auth.resetPassword({ token: raw, password: 'NewPassword1' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ passwordResetToken: null }) }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { revoked: true } });
  });

  it('reset-password rejects an invalid token', async () => {
    const prisma = makePrisma();
    const users = makeUsers();
    prisma.user.findFirst.mockResolvedValue(null);
    const auth = service(prisma, users);

    await expect(auth.resetPassword({ token: 'bad', password: 'NewPassword1' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
