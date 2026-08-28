import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLoggerService } from '../../common/logging/logger.service';

export const ROLES = ['CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPPORT', 'SUPER_ADMIN'] as const;
export type RoleName = (typeof ROLES)[number];

/** Default permission grants per role. Wildcard `*` grants everything. */
export const PERMISSIONS_BY_ROLE: Record<RoleName, string[]> = {
  CUSTOMER: ['profile:read', 'profile:update', 'booking:create', 'order:create', 'review:create'],
  PROVIDER: ['profile:read', 'profile:update', 'provider:manage', 'booking:manage'],
  SUPPORT: ['profile:read', 'support:access', 'booking:read', 'dispute:read'],
  ADMIN: [
    'admin:access',
    'user:read',
    'user:update',
    'user:status',
    'booking:read',
    'dispute:read',
    'dispute:resolve',
  ],
  SUPER_ADMIN: ['*'],
};

@Injectable()
export class RbacService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSeeded().catch((err) => {
      // No live DB in foundation/some environments; seed on first real boot.
      this.logger.warn(`RBAC seed skipped: ${(err as Error).message}`);
    });
  }

  /** Idempotently create the five platform roles and their permission grants. */
  async ensureSeeded(): Promise<void> {
    for (const roleName of ROLES) {
      const keys = PERMISSIONS_BY_ROLE[roleName];
      const permissionIds: string[] = [];
      for (const key of keys) {
        const perm = await this.prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key },
        });
        permissionIds.push(perm.id);
      }
      await this.prisma.role.upsert({
        where: { name: roleName },
        update: { permissions: { set: permissionIds.map((id) => ({ id })) } },
        create: { name: roleName, permissions: { connect: permissionIds.map((id) => ({ id })) } },
      });
    }
  }

  async assignRole(userId: string, role: RoleName): Promise<void> {
    const roleRecord = await this.prisma.role.findUnique({ where: { name: role } });
    if (!roleRecord) throw new Error(`Unknown role: ${role}`);
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: roleRecord.id } },
      update: {},
      create: { userId, roleId: roleRecord.id },
    });
  }

  async getRoles(userId: string): Promise<string[]> {
    const links = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return links.map((l) => l.role.name);
  }

  async getPermissions(userId: string): Promise<string[]> {
    const links = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: true } } },
    });
    const perms = new Set<string>();
    for (const link of links) {
      link.role.permissions.forEach((p) => perms.add(p.key));
    }
    return [...perms];
  }

  hasPermission(granted: string[], required: string): boolean {
    return granted.includes('*') || granted.includes(required);
  }
}
