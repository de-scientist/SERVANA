import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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

type Actor = { sub: string; role: string };

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
  async getCart(@CurrentUser() user: Actor) {
    return { data: await this.cart.getCart({ sub: user.sub, role: user.role }) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('cart/items')
  async addItem(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(addCartItemSchema)) body: any) {
    return { data: await this.cart.addItem({ sub: user.sub, role: user.role }, body) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Patch('cart/items/:id')
  async setQty(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) body: any,
  ) {
    return { data: await this.cart.setQty({ sub: user.sub, role: user.role }, id, body.qty) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Delete('cart/items/:id')
  async removeItem(@CurrentUser() user: Actor, @Param('id') id: string) {
    return { data: await this.cart.removeItem({ sub: user.sub, role: user.role }, id) };
  }

  // --- orders (customer) ----------------------------------------------------------

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('orders/checkout')
  async checkout(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(checkoutSchema)) body: any) {
    return { data: await this.orders.checkout({ sub: user.sub, role: user.role }, body) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('orders')
  async listMine(@CurrentUser() user: Actor, @Query(new ZodValidationPipe(listOrdersSchema)) query: any) {
    return this.orders.listMine({ sub: user.sub, role: user.role }, query);
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('orders/:id')
  async getOrder(@CurrentUser() user: Actor, @Param('id') id: string) {
    return { data: await this.orders.getMine({ sub: user.sub, role: user.role }, id) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('orders/:id/pay')
  async payOrder(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body() body: { method?: 'MPESA' | 'CARD' | 'BANK' | 'OTHER' },
  ) {
    return { data: await this.orders.pay({ sub: user.sub, role: user.role }, id, body?.method as any) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('orders/:id/cancel')
  async cancelMine(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelOrderSchema)) body: any,
  ) {
    return { data: await this.orders.cancel({ sub: user.sub, role: user.role }, id, body) };
  }

  // --- admin -------------------------------------------------------------------------

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/products')
  async createProduct(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(createProductSchema)) body: any) {
    return { data: await this.products.create({ sub: user.sub, role: user.role }, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Get('admin/products/:id')
  async getProductAdmin(@Param('id') id: string) {
    return { data: await this.products.getById(id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/products/:id')
  async updateProduct(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: any,
  ) {
    return { data: await this.products.update({ sub: user.sub, role: user.role }, id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Delete('admin/products/:id')
  async archiveProduct(@CurrentUser() user: Actor, @Param('id') id: string) {
    return { data: await this.products.archive({ sub: user.sub, role: user.role }, id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/products/:id/inventory')
  async setInventory(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setInventorySchema)) body: any,
  ) {
    return { data: await this.products.setInventory({ sub: user.sub, role: user.role }, id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/cross-sell')
  async createLink(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(createCrossSellLinkSchema)) body: any) {
    return { data: await this.products.createCrossSellLink({ sub: user.sub, role: user.role }, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Delete('admin/cross-sell/:id')
  async deleteLink(@CurrentUser() user: Actor, @Param('id') id: string) {
    return { data: await this.products.deleteCrossSellLink({ sub: user.sub, role: user.role }, id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/orders')
  async listAll(
    @CurrentUser() user: Actor,
    @Query(new ZodValidationPipe(listOrdersSchema)) query: any,
  ) {
    return this.orders.listAll({ sub: user.sub, role: user.role }, query);
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('admin/orders/:id/advance')
  async advance(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(advanceOrderSchema)) body: any,
  ) {
    return { data: await this.orders.advance({ sub: user.sub, role: user.role }, id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('admin/orders/:id/cancel')
  async cancelAdmin(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelOrderSchema)) body: any,
  ) {
    return { data: await this.orders.cancel({ sub: user.sub, role: user.role }, id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('admin/orders/:id/refund')
  async refundAdmin(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(refundOrderSchema)) body: any,
  ) {
    return { data: await this.orders.refund({ sub: user.sub, role: user.role }, id, body?.reason) };
  }
}
