import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toMinorUnits, fromMinorUnits } from '../../common/money/money';
import { findInventoryRow } from '../../common/inventory/inventory';
import {
  CreateProductInput,
  UpdateProductInput,
  ListProductsInput,
  SetInventoryInput,
  CrossSellQuery,
  CreateCrossSellLinkInput,
} from './dto/shop.schema';

export interface ShopActor {
  sub: string;
  role: string;
}

const PUBLIC_PRODUCT_INCLUDE = {
  variants: true,
  inventory: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- public browse ----------------------------------------------------------

  async list(input: ListProductsInput) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };
    if (input.categoryId) where.categoryId = input.categoryId;
    if (input.providerId) where.providerId = input.providerId;
    if (input.q) {
      where.OR = [
        { name: { contains: input.q, mode: 'insensitive' } },
        { brand: { contains: input.q, mode: 'insensitive' } },
        { sku: { contains: input.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PUBLIC_PRODUCT_INCLUDE,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: rows.map((p) => this.mapProduct(p)),
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 },
    };
  }

  async getPublic(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: PUBLIC_PRODUCT_INCLUDE,
    });
    if (!p || p.status !== 'ACTIVE') throw new NotFoundException('Product not found');
    return this.mapProduct(p);
  }

  // --- admin / seller management ----------------------------------------------

  async create(actor: ShopActor, input: CreateProductInput) {
    if (input.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!cat) throw new NotFoundException('Category not found');
    }
    if (input.providerId) {
      const seller = await (this.prisma as any).providerProfile?.findUnique?.({
        where: { id: input.providerId },
      });
      if (!seller) throw new NotFoundException('Seller provider not found');
    }
    if (input.salePrice != null && input.salePrice >= input.price) {
      throw new BadRequestException('Sale price must be below the regular price');
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: input.name,
            categoryId: input.categoryId ?? null,
            brand: input.brand ?? null,
            sku: input.sku,
            priceCents: toMinorUnits(input.price),
            saleCents: input.salePrice != null ? toMinorUnits(input.salePrice) : null,
            currency: input.currency ?? 'KES',
            status: input.status ?? 'ACTIVE',
            providerId: input.providerId ?? null,
            images: (input.images ?? null) as any,
          },
        });

        const variantByKey = new Map<string, string>();
        for (const v of input.variants ?? []) {
          const created_variant = await tx.productVariant.create({
            data: {
              productId: product.id,
              attrs: v.attrs as any,
              priceDeltaCents: toMinorUnits(v.priceDelta),
            },
          });
          variantByKey.set(JSON.stringify(v.attrs), created_variant.id);
        }

        // Seed inventory: explicit rows only. Missing variant rows mean
        // "not stocked" (unorderable), never infinite stock.
        for (const inv of input.inventory ?? []) {
          let variantId: string | null = null;
          if (inv.variantSelector) {
            variantId = variantByKey.get(JSON.stringify(inv.variantSelector)) ?? null;
            if (!variantId) {
              throw new BadRequestException('Inventory variantSelector matches no declared variant');
            }
          }
          await tx.inventory.create({
            data: { productId: product.id, variantId, quantity: inv.quantity, reserved: 0 },
          });
        }

        return product;
      });

      await this.audit.record({
        actorId: actor.sub,
        action: 'product.create',
        entity: 'product',
        entityId: created.id,
        after: { sku: input.sku, name: input.name },
      });

      return this.getById(created.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('SKU already exists');
      }
      throw err;
    }
  }

  async update(actor: ShopActor, id: string, input: UpdateProductInput) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    if (input.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!cat) throw new NotFoundException('Category not found');
    }
    const price = input.price != null ? toMinorUnits(input.price) : existing.priceCents;
    const sale =
      input.salePrice === null
        ? null
        : input.salePrice != null
          ? toMinorUnits(input.salePrice)
          : existing.saleCents;
    if (sale != null && sale >= price) {
      throw new BadRequestException('Sale price must be below the regular price');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        categoryId: input.categoryId ?? undefined,
        brand: input.brand ?? undefined,
        priceCents: input.price != null ? price : undefined,
        saleCents: input.salePrice === null ? null : input.salePrice != null ? sale : undefined,
        currency: input.currency ?? undefined,
        status: input.status ?? undefined,
        providerId: input.providerId ?? undefined,
        images: input.images !== undefined ? ((input.images ?? null) as any) : undefined,
      },
      include: PUBLIC_PRODUCT_INCLUDE,
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'product.update',
      entity: 'product',
      entityId: id,
      before: { priceCents: existing.priceCents.toString(), status: existing.status },
      after: { priceCents: updated.priceCents.toString(), status: updated.status },
    });

    return this.mapProduct(updated);
  }

  /** Archive, never hard-delete: past order items must keep resolving. */
  async archive(actor: ShopActor, id: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    await this.prisma.product.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await this.audit.record({
      actorId: actor.sub,
      action: 'product.archive',
      entity: 'product',
      entityId: id,
      before: { status: existing.status },
      after: { status: 'ARCHIVED' },
    });
    return { archived: true };
  }

  async getById(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: PUBLIC_PRODUCT_INCLUDE,
    });
    if (!p) throw new NotFoundException('Product not found');
    return this.mapProduct(p);
  }

  // --- inventory (admin) --------------------------------------------------------

  async setInventory(actor: ShopActor, productId: string, input: SetInventoryInput) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (input.variantId) {
      const variant = await this.prisma.productVariant.findUnique({ where: { id: input.variantId } });
      if (!variant || variant.productId !== productId) {
        throw new BadRequestException('Variant does not belong to this product');
      }
    }

    const variantId = input.variantId ?? null;
    const existing = await findInventoryRow(this.prisma, productId, variantId);
    const row = existing
      ? await this.prisma.inventory.update({ where: { id: existing.id }, data: { quantity: input.quantity } })
      : await this.prisma.inventory.create({
          data: { productId, variantId, quantity: input.quantity, reserved: 0 },
        });

    if (row.reserved > row.quantity) {
      throw new BadRequestException(
        `Cannot set stock to ${input.quantity}: ${row.reserved} unit(s) are reserved by open orders`,
      );
    }

    await this.audit.record({
      actorId: actor.sub,
      action: 'inventory.set',
      entity: 'inventory',
      entityId: row.id,
      after: { productId, variantId: input.variantId ?? null, quantity: input.quantity },
    });

    return { productId, variantId: input.variantId ?? null, quantity: row.quantity, reserved: row.reserved };
  }

  // --- cross-sell -----------------------------------------------------------------
  // Deterministic foundation (rules first, AI later):
  //   1. curated ServiceProductLink rows (explicit merchandising), then
  //   2. same-category ACTIVE products as fallback.
  // Only ACTIVE, stocked products are recommended. Never fabricated.

  async crossSell(query: CrossSellQuery) {
    const limit = query.limit ?? 8;
    let service: { id: string; categoryId: string } | null = null;

    if (query.serviceId) {
      service = await this.prisma.service.findUnique({
        where: { id: query.serviceId },
        select: { id: true, categoryId: true },
      });
      if (!service) throw new NotFoundException('Service not found');
    } else if (query.providerServiceId) {
      const ps = await (this.prisma as any).providerService?.findUnique?.({
        where: { id: query.providerServiceId },
        select: { serviceId: true, categoryId: true },
      });
      if (!ps) throw new NotFoundException('Provider service not found');
      if (ps.serviceId) {
        service = await this.prisma.service.findUnique({
          where: { id: ps.serviceId },
          select: { id: true, categoryId: true },
        });
      } else if (ps.categoryId) {
        service = { id: '', categoryId: ps.categoryId };
      }
      if (!service) throw new NotFoundException('Service not found');
    } else {
      throw new BadRequestException('serviceId or providerServiceId is required');
    }

    const picked: any[] = [];
    const seen = new Set<string>();

    if (service.id) {
      const links = await (this.prisma as any).serviceProductLink?.findMany?.({
        where: { serviceId: service.id, product: { status: 'ACTIVE' } },
        include: { product: { include: PUBLIC_PRODUCT_INCLUDE } },
        orderBy: { sortOrder: 'asc' },
        take: limit,
      }) ?? [];
      for (const l of links) {
        if (!l.product || seen.has(l.product.id)) continue;
        if (!this.isStocked(l.product)) continue;
        seen.add(l.product.id);
        picked.push({ ...this.mapProduct(l.product), reason: l.reason ?? null, source: 'curated' as const });
        if (picked.length >= limit) break;
      }
    }

    if (picked.length < limit && service.categoryId) {
      const fallback = await this.prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          categoryId: service.categoryId,
          id: seen.size ? { notIn: [...seen] } : undefined,
        },
        include: PUBLIC_PRODUCT_INCLUDE,
        orderBy: { name: 'asc' },
        take: limit - picked.length,
      });
      for (const p of fallback) {
        if (!this.isStocked(p)) continue;
        seen.add(p.id);
        picked.push({ ...this.mapProduct(p), reason: null, source: 'category' as const });
      }
    }

    return { data: picked };
  }

  async createCrossSellLink(actor: ShopActor, input: CreateCrossSellLinkInput) {
    const [service, product] = await Promise.all([
      this.prisma.service.findUnique({ where: { id: input.serviceId } }),
      this.prisma.product.findUnique({ where: { id: input.productId } }),
    ]);
    if (!service) throw new NotFoundException('Service not found');
    if (!product) throw new NotFoundException('Product not found');
    try {
      const link = await (this.prisma as any).serviceProductLink.create({
        data: {
          serviceId: input.serviceId,
          productId: input.productId,
          reason: input.reason ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await this.audit.record({
        actorId: actor.sub,
        action: 'crossSell.link',
        entity: 'serviceProductLink',
        entityId: link.id,
        after: input as any,
      });
      return link;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This service/product link already exists');
      }
      throw err;
    }
  }

  async deleteCrossSellLink(actor: ShopActor, id: string) {
    const existing = await (this.prisma as any).serviceProductLink?.findUnique?.({ where: { id } });
    if (!existing) throw new NotFoundException('Cross-sell link not found');
    await (this.prisma as any).serviceProductLink.delete({ where: { id } });
    await this.audit.record({
      actorId: actor.sub,
      action: 'crossSell.unlink',
      entity: 'serviceProductLink',
      entityId: id,
    });
    return { deleted: true };
  }

  // --- helpers ----------------------------------------------------------------------

  /** Effective unit price: sale price wins when set, plus variant delta. */
  effectiveUnitCents(product: { priceCents: bigint; saleCents: bigint | null }, variantDeltaCents = 0n): bigint {
    const base = product.saleCents ?? product.priceCents;
    const total = base + variantDeltaCents;
    return total >= 0n ? total : 0n;
  }

  private isStocked(p: any): boolean {
    const inv = (p.inventory ?? []) as Array<{ quantity: number; reserved: number }>;
    if (inv.length === 0) return false;
    return inv.some((r) => r.quantity - r.reserved > 0);
  }

  mapProduct(p: any) {
    const priceCents = BigInt(p.priceCents);
    const saleCents = p.saleCents != null ? BigInt(p.saleCents) : null;
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      sku: p.sku,
      categoryId: p.categoryId,
      category: p.category ?? null,
      priceCents: priceCents.toString(),
      price: fromMinorUnits(priceCents),
      saleCents: saleCents?.toString() ?? null,
      salePrice: saleCents != null ? fromMinorUnits(saleCents) : null,
      effectiveCents: (saleCents ?? priceCents).toString(),
      effectivePrice: fromMinorUnits(saleCents ?? priceCents),
      currency: p.currency,
      status: p.status,
      providerId: p.providerId,
      images: p.images ?? [],
      variants: (p.variants ?? []).map((v: any) => ({
        id: v.id,
        attrs: v.attrs,
        priceDeltaCents: BigInt(v.priceDeltaCents).toString(),
        priceDelta: fromMinorUnits(BigInt(v.priceDeltaCents)),
      })),
      inventory: (p.inventory ?? []).map((r: any) => ({
        variantId: r.variantId,
        quantity: r.quantity,
        reserved: r.reserved,
        available: r.quantity - r.reserved,
      })),
    };
  }
}
