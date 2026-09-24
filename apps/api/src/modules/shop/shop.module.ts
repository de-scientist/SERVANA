import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { ProductService } from './product.service';
import { CartService } from './cart.service';
import { OrderService } from './order.service';
import { ShopController } from './shop.controller';

@Module({
  imports: [PrismaModule, AuditModule, PaymentsModule, LoyaltyModule],
  controllers: [ShopController],
  providers: [ProductService, CartService, OrderService],
  exports: [ProductService, CartService, OrderService],
})
export class ShopModule {}
