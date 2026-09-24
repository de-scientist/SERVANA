import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentService } from '../payments/payment.service';
import { ProductService } from './product.service';
import { findInventoryRow } from '../../common/inventory/inventory';
import {
  CheckoutInput,
  ListOrdersInput,
  AdvanceOrderInput,
  CancelOrderInput,
} from './dto/shop.schema';

export interface OrderActor {
  sub: string;
  role: string;
}

/**
 * Legal order lifecycle. PENDING becomes PAID only via a verified payment
 * webhook — never by manual advance. Every transition writes history.
 */
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['READY', 'CANCELLED', 'REFUNDED'],
  READY: ['SHIPPED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['COMPLETED', 'REFUNDED'],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/** Manual fulfilment step: each status has exactly one forward successor. */
const NEXT_STEP: Record<string, string> = {
  PAID: 'PROCESSING',
  PROCESSING: 'READY',
  READY: 'SHIPPED',
  SHIPPED: 'DELIVERED',
  DELIVERED: 'COMPLETED',
};

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SUPPORT'];

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payments: PaymentService,
    private readonly products: ProductService,
  ) {}

  // --- checkout ---------------------------------------------------------------
  // Serializable transaction: re-checks stock inside the txn so concurrent
  // checkouts can never oversell. Reservation (reserved += qty) holds units
  // until payment finalizes (quantity -= qty) or cancel/release returns them.

  async checkout(actor: OrderActor, input: CheckoutInput) {
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: actor.sub },
      include: {
        items: {
          include: { product: { include: { variants: true, inventory: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const order = await this.prisma.$transaction(
      async (tx) => {
        const lines: Array<{
          productId: string;
          variantId: string | null;
          qty: number;
          unitCents: bigint;
          currency: string;
        }> = [];
        let subtotal = 0n;
        let currency = 'KES';

        for (const item of cart.items) {
          const p = item.product;
          if (!p || p.status !== 'ACTIVE') {
            throw new BadRequestException(`Product is no longer available`);
          }
          let delta = 0n;
          if (item.variantId) {
            const variant = p.variants.find((v) => v.id === item.variantId);
            if (!variant) throw new BadRequestException('Invalid product variant');
            delta = variant.priceDeltaCents;
          }
          const unit = this.products.effectiveUnitCents(
            { priceCents: p.priceCents, saleCents: p.saleCents },
            delta,
          );
          currency = p.currency;

          // Re-read inventory inside the txn (serializable → no oversell).
          const row = await findInventoryRow(tx, p.id, item.variantId ?? null);
          if (!row) {
            throw new BadRequestException(`"${p.name}" is out of stock`);
          }
          if (row.quantity - row.reserved < item.qty) {
            throw new ConflictException(
              `Only ${row.quantity - row.reserved} unit(s) of "${p.name}" left in stock`,
            );
          }
          await tx.inventory.update({
            where: { id: row.id },
            data: { reserved: { increment: item.qty } },
          });

          lines.push({ productId: p.id, variantId: item.variantId ?? null, qty: item.qty, unitCents: unit, currency: p.currency });
          subtotal += unit * BigInt(item.qty);
        }

        const created = await tx.order.create({
          data: {
            customerId: actor.sub,
            status: 'PENDING',
            subtotalCents: subtotal,
            discountCents: 0n,
            totalCents: subtotal,
            currency,
            items: {
              create: lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
                qty: l.qty,
                unitCents: l.unitCents,
              })),
            },
          },
          include: { items: true },
        });
        await tx.orderStatusHistory.create({
          data: { orderId: created.id, from: null, to: 'PENDING', },
        });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.record({
      actorId: actor.sub,
      action: 'order.checkout',
      entity: 'order',
      entityId: order.id,
      after: { totalCents: order.totalCents.toString(), items: order.items.length },
    });

    // Initiate payment (PENDING). The order becomes PAID only when the
    // provider webhook confirms the money — never before.
    const payment = await this.payments.initiateForOrder(
      { sub: actor.sub, role: actor.role as any },
      order.id,
      (input.method ?? 'OTHER') as any,
    );

    return { order: this.mapOrder({ ...order, history: [{ from: null, to: 'PENDING' }] }), payment };
  }

  // --- reads --------------------------------------------------------------------

  /** Retry payment for a still-PENDING order (fresh provider reference). */
  async pay(actor: OrderActor, id: string, method?: 'MPESA' | 'CARD' | 'BANK' | 'OTHER') {
    return this.payments.retryOrderPayment({ sub: actor.sub, role: actor.role as any }, id, method as any);
  }

  async listMine(actor: OrderActor, query: ListOrdersInput) {
    return this.list({ customerId: actor.sub }, query);
  }

  async listAll(actor: OrderActor, query: ListOrdersInput & { customerId?: string }) {
    if (!ADMIN_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Only admins can list all orders');
    }
    const where: Prisma.OrderWhereInput = {};
    if (query.customerId) where.customerId = query.customerId;
    return this.list(where, query);
  }

  private async list(whereBase: Prisma.OrderWhereInput, query: ListOrdersInput) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.OrderWhereInput = { ...whereBase };
    if (query.status) where.status = query.status as any;
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: this.orderInclude(),
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data: rows.map((o) => this.mapOrder(o)),
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 },
    };
  }

  async getMine(actor: OrderActor, id: string) {    const order = await this.prisma.order.findUnique({ where: { id }, include: this.orderInclude() });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== actor.sub && !ADMIN_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Not your order');
    }
    return this.mapOrder(order);
  }

  // --- fulfilment ------------------------------------------------------------------

  async advance(actor: OrderActor, id: string, input: AdvanceOrderInput) {
    if (!ADMIN_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Only fulfilment staff can advance orders');
    }
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    const expected = NEXT_STEP[order.status];
    if (!expected || input.to !== expected) {
      throw new BadRequestException(
        `Order in status ${order.status} cannot advance to ${input.to}` +
          (expected ? ` (expected ${expected})` : ''),
      );
    }
    return this.transition(order.id, order.status as string, input.to, actor.sub, 'Fulfilment advance');
  }

  /**
   * Cancel an unpaid order (customer own PENDING, or staff PENDING/PAID/
   * PROCESSING). Releases reservations; restocks finalized units; voids a
   * still-pending payment. Paid-money returns go through refund(), never here.
   */
  async cancel(actor: OrderActor, id: string, input: CancelOrderInput) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, payment: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const isAdmin = ADMIN_ROLES.includes(actor.role);
    if (!isAdmin && order.customerId !== actor.sub) {
      throw new ForbiddenException('Not your order');
    }
    if (!ORDER_TRANSITIONS[order.status]?.includes('CANCELLED')) {
      throw new BadRequestException(`Order in status ${order.status} cannot be cancelled`);
    }
    if (!isAdmin && order.status !== 'PENDING') {
      throw new ForbiddenException('Only unpaid orders can be cancelled by customers');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const payment: any = (order as any).payment;
        const finalized = payment?.status === 'SUCCESSFUL';
        if (!finalized && payment && payment.status !== 'SUCCESSFUL' && payment.status !== 'REFUNDED') {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } });
        }
        for (const item of order.items) {
          const row = await findInventoryRow(tx, item.productId, item.variantId ?? null);
          if (!row) continue;
          if (finalized) {
            // Stock was deducted at capture: put units back.
            await tx.inventory.update({ where: { id: row.id }, data: { quantity: { increment: item.qty } } });
          } else {
            // Only reserved: release the hold (floor at 0 for safety).
            await tx.inventory.update({
              where: { id: row.id },
              data: { reserved: Math.max(0, row.reserved - item.qty) },
            });
          }
        }
        await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
        await tx.orderStatusHistory.create({
          data: { orderId: id, from: order.status as any, to: 'CANCELLED' },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.record({
      actorId: actor.sub,
      action: 'order.cancel',
      entity: 'order',
      entityId: id,
      before: { status: order.status },
      after: { status: 'CANCELLED' },
      reason: input.reason ?? null,
    });

    return this.getMine(actor, id);
  }

  /** Paid-money returns: admin-only, delegates ledger reversal to payments. */
  async refund(actor: OrderActor, id: string, reason?: string) {
    if (!ADMIN_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Only admins can refund orders');
    }
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!ORDER_TRANSITIONS[order.status]?.includes('REFUNDED')) {
      throw new BadRequestException(`Order in status ${order.status} cannot be refunded`);
    }
    const payment: any = (order as any).payment;
    if (!payment || payment.status !== 'SUCCESSFUL') {
      throw new BadRequestException('Only a successfully paid order can be refunded');
    }
    // PaymentService reverses payment + earning + loyalty and restocks
    // finalized units; it also flips the order to REFUNDED with history.
    await this.payments.refund({ sub: actor.sub, role: actor.role as any }, payment.id, reason ?? 'Order refunded');
    return this.getMine(actor, id);
  }

  // --- internal transitions (webhook calls these) ------------------------------------

  /** Webhook-only: PENDING → PAID after verified capture. */
  async markPaid(orderId: string, tx: Prisma.TransactionClient) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    if (order.status !== 'PENDING') return;
    await tx.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
    await tx.orderStatusHistory.create({ data: { orderId, from: 'PENDING', to: 'PAID' } });
  }

  async transition(id: string, from: string, to: string, actorId: string | null, reason?: string) {
    if (!ORDER_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(`Invalid order transition: ${from} → ${to}`);
    }
    await this.prisma.order.update({ where: { id }, data: { status: to as any } });
    await this.prisma.orderStatusHistory.create({
      data: { orderId: id, from: from as any, to: to as any },
    });
    await this.audit.record({
      actorId,
      action: 'order.transition',
      entity: 'order',
      entityId: id,
      before: { status: from },
      after: { status: to },
      reason: reason ?? undefined,
    });
    const updated = await this.prisma.order.findUnique({ where: { id }, include: this.orderInclude() });
    return this.mapOrder(updated);
  }

  // --- helpers --------------------------------------------------------------------------

  private orderInclude(): Prisma.OrderInclude {
    return {
      items: { include: { product: { select: { id: true, name: true, sku: true, currency: true } } } },
      history: { orderBy: { createdAt: 'asc' } },
      payment: { select: { id: true, status: true, providerRef: true } },
    };
  }

  private mapOrder(o: any) {
    return {
      id: o.id,
      customerId: o.customerId,
      status: o.status,
      subtotalCents: o.subtotalCents?.toString?.() ?? String(o.subtotalCents),
      discountCents: o.discountCents?.toString?.() ?? String(o.discountCents),
      totalCents: o.totalCents?.toString?.() ?? String(o.totalCents),
      currency: o.currency,
      items: (o.items ?? []).map((i: any) => ({
        id: i.id,
        productId: i.productId,
        productName: i.product?.name ?? null,
        sku: i.product?.sku ?? null,
        variantId: i.variantId,
        qty: i.qty,
        unitCents: i.unitCents?.toString?.() ?? String(i.unitCents),
      })),
      payment: o.payment ?? null,
      history: (o.history ?? []).map((h: any) => ({ from: h.from, to: h.to, createdAt: h.createdAt })),
    };
  }
}
