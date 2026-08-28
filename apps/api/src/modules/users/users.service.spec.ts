import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { UsersService } from './users.service';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    refreshToken: { updateMany: jest.fn() },
  } as any;
}

const baseUser = {
  id: 'u1',
  email: 'a@b.com',
  name: 'Ada',
  phone: null,
  profileImage: null,
  status: 'ACTIVE',
  emailVerified: true,
  lat: null,
  lng: null,
  address: null,
  preferences: null,
  createdAt: new Date(),
  roles: [{ role: { name: 'CUSTOMER' } }],
};

describe('UsersService', () => {
  it('getProfile maps roles', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(baseUser);
    const svc = new UsersService(prisma);

    const profile = await svc.getProfile('u1');
    expect(profile.id).toBe('u1');
    expect(profile.roles).toEqual(['CUSTOMER']);
    expect(profile.emailVerified).toBe(true);
  });

  it('updateProfile writes JsonNull for explicit null json', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);
    const svc = new UsersService(prisma);

    await svc.updateProfile('u1', { name: 'Ada2', preferences: null, address: { city: 'Nairobi' } });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ name: 'Ada2', preferences: Prisma.JsonNull, address: { city: 'Nairobi' } as any }),
      }),
    );
  });

  it('changePassword rejects a wrong current password', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: await bcrypt.hash('OldPass1', 10) });
    const svc = new UsersService(prisma);

    await expect(svc.changePassword('u1', 'nope', 'NewPass1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('changePassword updates hash and revokes sessions', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: await bcrypt.hash('OldPass1', 10) });
    prisma.user.update.mockResolvedValue({});
    const svc = new UsersService(prisma);

    await svc.changePassword('u1', 'OldPass1', 'NewPass1');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ passwordHash: expect.any(String) }) }));
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { revoked: true } });
  });

  it('setStatus updates account status', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({});
    const svc = new UsersService(prisma);

    await svc.setStatus('u1', 'SUSPENDED');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { status: 'SUSPENDED' } });
  });

  it('changeEmail rejects an already-used email', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockImplementation(async (args: { where: { id?: string; email?: string } }) => {
      if (args.where.email === 'taken@b.com') return Promise.resolve({ id: 'other' });
      return Promise.resolve({ ...baseUser, passwordHash: await bcrypt.hash('OldPass1', 10) });
    });
    const svc = new UsersService(prisma);

    await expect(svc.changeEmail('u1', 'OldPass1', 'taken@b.com')).rejects.toBeInstanceOf(ConflictException);
  });
});
