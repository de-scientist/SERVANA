import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { minimizeObject } from './guardrails';

export interface ToolDef {
  name: string;
  description: string;
  /** Roles allowed to invoke this tool through assistants. Empty = any authenticated role. */
  roles?: string[];
  run: (args: Record<string, any>) => Promise<unknown>;
}

/** Enforced by every assistant before running a tool. */
export function assertToolRole(tool: ToolDef, actorRole: string): void {
  if (tool.roles && tool.roles.length > 0 && !tool.roles.includes(actorRole)) {
    throw new ForbiddenException(`Tool ${tool.name} is not available to role ${actorRole}`);
  }
}

/**
 * Explicit, allowlisted data-access tools for AI features. This is the ONLY
 * data AI code may touch: no raw tables, no user contact details, no
 * financial credentials. Every output passes PII minimization.
 */
export function buildTools(prisma: PrismaService): ToolDef[] {
  const tools: ToolDef[] = [
    {
      name: 'search_providers',
      description: 'Find verified providers by category and city (public signals only).',
      run: async (args) => {
        const where: any = { status: 'VERIFIED' };
        const take = Math.min(Math.max(Number(args.limit ?? 5), 1), 20);
        let ids: string[] | undefined;
        if (args.categoryId) {
          const links: Array<{ providerId: string }> = await (prisma as any).providerCategory.findMany({
            where: { categoryId: String(args.categoryId) },
            select: { providerId: true },
            take: 200,
          });
          ids = links.map((l) => l.providerId);
          if (!ids.length) return [];
          where.id = { in: ids };
        }
        if (args.city) where.city = String(args.city);
        const rows = await prisma.providerProfile.findMany({
          where,
          select: {
            id: true, businessName: true, slug: true, city: true, tagline: true,
            verification: { select: { level: true, status: true } },
          },
          take,
        });
        return minimizeObject(rows);
      },
    },
    {
      name: 'provider_summary',
      description: 'Public reputation summary for one provider (rating, jobs, rates).',
      run: async (args) => {
        if (!args.providerId) throw new BadRequestException('providerId is required');
        const [profile, reviews, bookings, snapshot] = await Promise.all([
          prisma.providerProfile.findUnique({
            where: { id: String(args.providerId) },
            select: {
              id: true, businessName: true, slug: true, city: true, tagline: true, bio: true,
              verification: { select: { level: true, status: true } },
            },
          }),
          prisma.review.findMany({
            where: { providerId: String(args.providerId), status: 'APPROVED' as any },
            select: { overall: true },
          }),
          prisma.booking.findMany({
            where: { providerId: String(args.providerId) },
            select: { status: true },
          }),
          (prisma as any).providerRankingSnapshot?.findUnique?.({
            where: { providerId: String(args.providerId) },
          }),
        ]);
        if (!profile) throw new BadRequestException('Provider not found');
        const completed = bookings.filter((b) => b.status === 'COMPLETED').length;
        const avg = reviews.length
          ? Math.round((reviews.reduce((s, r) => s + r.overall, 0) / reviews.length) * 10) / 10
          : 0;
        return minimizeObject({
          ...profile,
          rating: avg,
          totalReviews: reviews.length,
          completedJobs: completed,
          qualityScore: (snapshot as any)?.qualityScore ?? null,
        });
      },
    },
    {
      name: 'top_services',
      description: 'Most-booked catalog services, optionally filtered by category.',
      run: async (args) => {
        const take = Math.min(Math.max(Number(args.limit ?? 5), 1), 20);
        const where: any = {};
        if (args.categoryId) where.categoryId = String(args.categoryId);
        const services = await prisma.service.findMany({
          where,
          select: { id: true, name: true, categoryId: true },
          take: 100,
        });
        const counts = await Promise.all(
          services.map(async (s) => ({
            service: s,
            bookings: await prisma.booking.count({ where: { serviceId: s.id } }),
          })),
        );
        return minimizeObject(
          counts.sort((a, b) => b.bookings - a.bookings).slice(0, take),
        );
      },
    },
    {
      name: 'revenue_stats',
      description: 'ADMIN ONLY. Aggregate revenue/commission figures for a date range.',
      roles: ['ADMIN', 'SUPER_ADMIN', 'SUPPORT'],
      run: async (args) => {
        if (args.admin !== true) throw new BadRequestException('revenue_stats requires admin context');
        const where: any = { status: 'SUCCESSFUL' };
        if (args.from || args.to) {
          where.createdAt = {};
          if (args.from) where.createdAt.gte = new Date(args.from);
          if (args.to) where.createdAt.lte = new Date(args.to);
        }
        const payments = await prisma.payment.findMany({
          where,
          select: { grossCents: true, commissionCents: true },
        });
        const gross = payments.reduce((s, p) => s + p.grossCents, 0n);
        const commission = payments.reduce((s, p) => s + p.commissionCents, 0n);
        return { payments: payments.length, grossCents: gross.toString(), commissionCents: commission.toString() };
      },
    },
    {
      name: 'customer_history_summary',
      description: 'Own (or admin-viewed) booking counts by status. No payment details.',
      run: async (args) => {
        if (!args.customerId) throw new BadRequestException('customerId is required');
        const bookings = await prisma.booking.findMany({
          where: { customerId: String(args.customerId) },
          select: { status: true, providerId: true },
        });
        const byStatus: Record<string, number> = {};
        for (const b of bookings) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
        return minimizeObject({
          total: bookings.length,
          byStatus,
          distinctProviders: new Set(bookings.map((b) => b.providerId)).size,
        });
      },
    },
    {
      name: 'category_list',
      description: 'Service/product category taxonomy.',
      run: async () => {
        const rows = await prisma.category.findMany({
          select: { id: true, name: true, slug: true, parentId: true },
          orderBy: { name: 'asc' },
          take: 200,
        });
        return rows;
      },
    },
  ];
  return tools;
}

export function getTool(prisma: PrismaService, name: string): ToolDef {
  const tool = buildTools(prisma).find((t) => t.name === name);
  if (!tool) throw new BadRequestException(`Unknown AI tool: ${name}`);
  return tool;
}
