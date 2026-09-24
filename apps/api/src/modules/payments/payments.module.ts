import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../../common/adapters/payment/payment.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PaymentGateway } from './payment.gateway';
import { CommissionService } from './commission.service';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentWebhookController } from './payment-webhook.controller';
import { CommissionController } from './commission.controller';
import { PayoutController } from './payout.controller';
import { PayoutService } from './payout.service';
import { PayoutMethodService } from './payout-method.service';

@Module({
  imports: [PrismaModule, PaymentModule, LoyaltyModule, NotificationsModule, AnalyticsModule],
  controllers: [PaymentController, PaymentWebhookController, CommissionController, PayoutController],
  providers: [PaymentGateway, CommissionService, PaymentService, PayoutService, PayoutMethodService],
  exports: [PaymentService, CommissionService, PayoutService, PayoutMethodService],
})
export class PaymentsModule {}
