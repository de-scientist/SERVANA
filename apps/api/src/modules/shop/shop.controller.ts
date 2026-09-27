import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProductService } from './product.service';
import { CartService } from './cart.service';
import { OrderService } from './order.service';
import {
  createProductSchema,
  updateProductSchema,
  listProductsSchema,
  setInventorySchema,
  crossSellQuerySchema,
  createCrossSellLinkSchema,
  addCartItemSchema,
  updateCartItemSchema,
  checkoutSchema,
  listOrdersSchema,
  advanceOrderSchema,
  cancelOrderSchema,
  refundOrderSchema,
} from './dto/shop.schema';

type JwtUser = { sub: string; roles?: string[] };

/** SECURITY: derive the actor role from JWT `roles[]` (never `user.role`). */
function toActor(user: JwtUser): { sub: string; role: string } {
  const roles = user.roles ?? [];
  const role = roles.includes('SUPER_ADMIN')
    ? 'SUPER_ADMIN'
    : roles.includes('ADMIN')
      ? 'ADMIN'
      : roles.includes('SUPPORT')
        ? 'SUPPORT'
        : roles.includes('PROVIDER')
          ? 'PROVIDER'
          : 'CUSTOMER';
  return { sub: user.sub, role };
}

const promoCodeSchema = z.object({ code: z.string().trim().min(1).max(64) });
const payOrderSchema = z.object({ method: z.enum(['MPESA', 'CARD', 'BANK', 'OTHER']).optional() });

@Controller()
export class ShopController {
  constructor(
    private readonly products: ProductService,
    private readonly cart: CartService,
    private readonly orders: OrderService,
  ) {}

  // --- public catalog ---------------------------------------------------------

  @Get('products')
  async listProducts(@Query(new ZodValidationPipe(listProductsSchema)) query: any) {
    return this.products.list(query);
  }

  // Static cross-sell route must precede ':id'.
  @Get('products/cross-sell')
  async crossSell(@Query(new ZodValidationPipe(crossSellQuerySchema)) query: any) {
    return this.products.crossSell(query);
  }

  @Get('products/:id')
  async getProduct(@Param('id') id: string) {
    return { data: await this.products.getPublic(id) };
  }

  // --- cart (customer) ----------------------------------------------------------

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('cart')
  async getCart(@CurrentUser() user: JwtUser) {
    return { data: await this.cart.getCart(toActor(user)) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('cart/items')
  async addItem(@CurrentUser() user: JwtUser, @Body(new ZodValidationPipe(addCartItemSchema)) body: any) {
    return { data: await this.cart.addItem(toActor(user), body) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Patch('cart/items/:id')
  async setQty(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) body: any,
  ) {
    return { data: await this.cart.setQty(toActor(user), id, body.qty) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Delete('cart/items/:id')
  async removeItem(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return { data: await this.cart.removeItem(toActor(user), id) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('cart/promotions/validate')
  async validatePromo(@CurrentUser() user: JwtUser, @Body(new ZodValidationPipe(promoCodeSchema)) body: { code: string }) {
    if (!body?.code) throw new BadRequestException('code is required');
    return { data: await this.orders.previewPromo(toActor(user), body.code) };
  }

  // --- orders (customer) ----------------------------------------------------------

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('orders/checkout')
  async checkout(@CurrentUser() user: JwtUser, @Body(new ZodValidationPipe(checkoutSchema)) body: any) {
    return { data: await this.orders.checkout(toActor(user), body) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('orders')
  async listMine(@CurrentUser() user: JwtUser, @Query(new ZodValidationPipe(listOrdersSchema)) query: any) {
    return this.orders.listMine(toActor(user), query);
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('orders/:id')
  async getOrder(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return { data: await this.orders.getMine(toActor(user), id) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('orders/:id/pay')
  async payOrder(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(payOrderSchema)) body: { method?: 'MPESA' | 'CARD' | 'BANK' | 'OTHER' },
  ) {
    return { data: await this.orders.pay(toActor(user), id, body?.method as any) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('orders/:id/cancel')
  async cancelMine(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelOrderSchema)) body: any,
  ) {
    return { data: await this.orders.cancel(toActor(user), id, body) };
  }

  // --- admin -------------------------------------------------------------------------

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/products')
  async createProduct(@CurrentUser() user: JwtUser, @Body(new ZodValidationPipe(createProductSchema)) body: any) {
    return { data: await this.products.create(toActor(user), body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Get('admin/products/:id')
  async getProductAdmin(@Param('id') id: string) {
    return { data: await this.products.getById(id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/products/:id')
  async updateProduct(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: any,
  ) {
    return { data: await this.products.update(toActor(user), id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Delete('admin/products/:id')
  async archiveProduct(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return { data: await this.products.archive(toActor(user), id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/products/:id/inventory')
  async setInventory(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setInventorySchema)) body: any,
  ) {
    return { data: await this.products.setInventory(toActor(user), id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/cross-sell')
  async createLink(@CurrentUser() user: JwtUser, @Body(new ZodValidationPipe(createCrossSellLinkSchema)) body: any) {
    return { data: await this.products.createCrossSellLink(toActor(user), body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Delete('admin/cross-sell/:id')
  async deleteLink(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return { data: await this.products.deleteCrossSellLink(toActor(user), id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/orders')
  async listAll(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(listOrdersSchema)) query: any,
  ) {
    return this.orders.listAll(toActor(user), query);
  }

  // SECURITY: fulfilment state changes and paid-money refunds are
  // ADMIN/SUPER_ADMIN only — SUPPORT is read-only.
  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/orders/:id/advance')
  async advance(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(advanceOrderSchema)) body: any,
  ) {
    return { data: await this.orders.advance(toActor(user), id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/orders/:id/cancel')
  async cancelAdmin(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelOrderSchema)) body: any,
  ) {
    return { data: await this.orders.cancel(toActor(user), id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/orders/:id/refund')
  async refundAdmin(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(refundOrderSchema)) body: any,
  ) {
    return { data: await this.orders.refund(toActor(user), id, body?.reason) };
  }
}
