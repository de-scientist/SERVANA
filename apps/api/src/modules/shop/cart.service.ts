import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductService } from './product.service';
import { AddCartItemInput } from './dto/shop.schema';

export interface CartActor {
  sub: string;
  role: string;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductService,
  ) {}

  private async getOrCreateCart(customerId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { customerId },
      include: {
        items: {
          include: {
            product: { include: { variants: true, inventory: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { customerId },
        include: {
          items: {
            include: { product: { include: { variants: true, inventory: true } } },
            orderBy: { id: 'asc' },
          },
        },
      });
    }
    return cart;
  }

  async getCart(actor: CartActor) {
    const cart = await this.getOrCreateCart(actor.sub);
    return this.mapCart(cart);
  }

  async addItem(actor: CartActor, input: AddCartItemInput) {
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      include: { variants: true },
    });
    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException('Product is not available');
    }
    if (input.variantId) {
      const variant = product.variants.find((v) => v.id === input.variantId);
      if (!variant) throw new BadRequestException('Variant does not belong to this product');
    }

    const cart = await this.getOrCreateCart(actor.sub);
    const variantId = input.variantId ?? null;
    // Serializable txn: concurrent adds can never duplicate a cart line.
    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.cartItem.findFirst({
          where: { cartId: cart.id, productId: input.productId, variantId },
        });
        if (existing) {
          await tx.cartItem.update({ where: { id: existing.id }, data: { qty: { increment: input.qty } } });
        } else {
          await tx.cartItem.create({
            data: { cartId: cart.id, productId: input.productId, variantId, qty: input.qty },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.getCart(actor);
  }

  async setQty(actor: CartActor, itemId: string, qty: number) {
    const cart = await this.getOrCreateCart(actor.sub);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    if (qty <= 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      await this.prisma.cartItem.update({ where: { id: itemId }, data: { qty } });
    }
    return this.getCart(actor);
  }

  async removeItem(actor: CartActor, itemId: string) {
    return this.setQty(actor, itemId, 0);
  }

  async clear(actor: CartActor) {
    const cart = await this.getOrCreateCart(actor.sub);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  private mapCart(cart: any) {
    let subtotal = 0n;
    const items = (cart.items ?? []).map((i: any) => {
      const variant = (i.product?.variants ?? []).find((v: any) => v.id === i.variantId);
      const delta = variant ? BigInt(variant.priceDeltaCents) : 0n;
      const unit = this.products.effectiveUnitCents(
        { priceCents: BigInt(i.product.priceCents), saleCents: i.product.saleCents != null ? BigInt(i.product.saleCents) : null },
        delta,
      );
      const line = unit * BigInt(i.qty);
      subtotal += line;
      return {
        id: i.id,
        productId: i.productId,
        productName: i.product?.name ?? null,
        variantId: i.variantId,
        variantAttrs: variant?.attrs ?? null,
        qty: i.qty,
        unitCents: unit.toString(),
        lineCents: line.toString(),
        currency: i.product?.currency ?? 'KES',
      };
    });
    return { id: cart.id, items, subtotalCents: subtotal.toString() };
  }
}
