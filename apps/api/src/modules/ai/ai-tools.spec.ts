import { ForbiddenException } from '@nestjs/common';
import { buildTools, getTool, assertToolRole } from './ai-tools';

const prisma: any = {
  providerProfile: { findMany: jest.fn().mockResolvedValue([]) },
  providerCategory: { findMany: jest.fn().mockResolvedValue([]) },
};

describe('ai-tools (authorization)', () => {
  it('exposes a fixed allowlist — nothing else is callable', () => {
    const names = buildTools(prisma).map((t) => t.name);
    expect(names.sort()).toEqual(
      ['category_list', 'customer_history_summary', 'provider_summary', 'revenue_stats', 'search_providers', 'top_services'].sort(),
    );
    expect(() => getTool(prisma, 'drop_tables')).toThrow();
  });

  it('restricts revenue_stats to staff roles', () => {
    const tool = getTool(prisma, 'revenue_stats');
    expect(() => assertToolRole(tool, 'CUSTOMER')).toThrow(ForbiddenException);
    expect(() => assertToolRole(tool, 'PROVIDER')).toThrow(ForbiddenException);
    expect(() => assertToolRole(tool, 'ADMIN')).not.toThrow();
    expect(() => assertToolRole(tool, 'SUPPORT')).not.toThrow();
  });

  it('leaves public tools open to any authenticated role', () => {
    for (const name of ['search_providers', 'provider_summary', 'category_list']) {
      const tool = getTool(prisma, name);
      expect(() => assertToolRole(tool, 'CUSTOMER')).not.toThrow();
    }
  });
});
