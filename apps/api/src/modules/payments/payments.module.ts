import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../../common/adapters/payment/payment.module';
import { PaymentGateway } from './payment.gateway';
import { CommissionService } from './commission.service';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  imports: [PrismaModule, PaymentModule],
  controllers: [PaymentController, PaymentWebhookController],
  providers: [PaymentGateway, CommissionService, PaymentService],
  exports: [PaymentService],
})
export class PaymentsModule {}
