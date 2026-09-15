import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../../common/adapters/payment/payment.module';
import { PaymentGateway } from './payment.gateway';
import { CommissionService } from './commission.service';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentWebhookController } from './payment-webhook.controller';
import { CommissionController } from './commission.controller';
<<<<<<< HEAD
import { PayoutController } from './payout.controller';
import { PayoutService } from './payout.service';
import { PayoutMethodService } from './payout-method.service';

@Module({
  imports: [PrismaModule, PaymentModule],
  controllers: [PaymentController, PaymentWebhookController, CommissionController, PayoutController],
  providers: [PaymentGateway, CommissionService, PaymentService, PayoutService, PayoutMethodService],
  exports: [PaymentService, CommissionService, PayoutService, PayoutMethodService],
=======

@Module({
  imports: [PrismaModule, PaymentModule],
  controllers: [PaymentController, PaymentWebhookController, CommissionController],
  providers: [PaymentGateway, CommissionService, PaymentService],
  exports: [PaymentService, CommissionService],
>>>>>>> origin/main
})
export class PaymentsModule {}
