import { RbacService } from './rbac.service';

function makePrisma() {
  return {
    permission: { upsert: jest.fn().mockResolvedValue({ id: 'p1' }) },
    role: { upsert: jest.fn(), findUnique: jest.fn() },
    userRole: { upsert: jest.fn(), findMany: jest.fn() },
  } as any;
}

describe('RbacService', () => {
  it('getRoles returns assigned role names', async () => {
    const prisma = makePrisma();
    prisma.userRole.findMany.mockResolvedValue([{ role: { name: 'CUSTOMER' } }, { role: { name: 'PROVIDER' } }]);
    const svc = new RbacService(prisma, {} as any);

    expect(await svc.getRoles('u1')).toEqual(['CUSTOMER', 'PROVIDER']);
  });

  it('getPermissions returns wildcard for SUPER_ADMIN', async () => {
    const prisma = makePrisma();
    prisma.userRole.findMany.mockResolvedValue([{ role: { name: 'SUPER_ADMIN', permissions: [{ key: '*' }] } }]);
    const svc = new RbacService(prisma, {} as any);

    const perms = await svc.getPermissions('u1');
    expect(perms).toContain('*');
  });

  it('getPermissions unions role grants', async () => {
    const prisma = makePrisma();
    prisma.userRole.findMany.mockResolvedValue([
      { role: { name: 'CUSTOMER', permissions: [{ key: 'profile:read' }] } },
      { role: { name: 'PROVIDER', permissions: [{ key: 'provider:manage' }] } },
    ]);
    const svc = new RbacService(prisma, {} as any);

    const perms = await svc.getPermissions('u1');
    expect(perms).toEqual(expect.arrayContaining(['profile:read', 'provider:manage']));
  });

  it('hasPermission respects wildcard and membership', () => {
    const svc = new RbacService({} as any, {} as any);
    expect(svc.hasPermission(['*'], 'admin:access')).toBe(true);
    expect(svc.hasPermission(['profile:read'], 'profile:read')).toBe(true);
    expect(svc.hasPermission(['profile:read'], 'admin:access')).toBe(false);
  });
});
