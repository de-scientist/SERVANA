/* eslint-disable */
/**
 * Seed an initial SUPER_ADMIN user. Idempotent (upsert by email).
 *
 * Usage:
 *   DATABASE_URL=postgresql://servana:servana@127.0.0.1:5432/servana \
 *   SUPER_ADMIN_EMAIL=admin@servana.app \
 *   SUPER_ADMIN_PASSWORD='ChangeMe!123' \
 *   node scripts/seed-super-admin.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const ROLES = ['CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPPORT', 'SUPER_ADMIN'];
const PERMISSIONS_BY_ROLE = {
  CUSTOMER: ['profile:read', 'profile:update', 'booking:create', 'order:create', 'review:create'],
  PROVIDER: ['profile:read', 'profile:update', 'provider:manage', 'booking:manage'],
  SUPPORT: ['profile:read', 'support:access', 'booking:read', 'dispute:read'],
  ADMIN: ['admin:access', 'user:read', 'user:update', 'user:status', 'booking:read', 'dispute:read', 'dispute:resolve'],
  SUPER_ADMIN: ['*'],
};

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  // Ensure roles + permission grants exist (mirrors RbacService.ensureSeeded).
  for (const roleName of ROLES) {
    const keys = PERMISSIONS_BY_ROLE[roleName];
    const permissionIds = [];
    for (const key of keys) {
      const perm = await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key },
      });
      permissionIds.push(perm.id);
    }
    await prisma.role.upsert({
      where: { name: roleName },
      update: { permissions: { set: permissionIds.map((id) => ({ id })) } },
      create: { name: roleName, permissions: { connect: permissionIds.map((id) => ({ id })) } },
    });
  }

  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@servana.app';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe!123';
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name, emailVerified: true, status: 'ACTIVE' },
  });

  const role = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log(`Super admin ready: ${email} (id=${user.id})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
