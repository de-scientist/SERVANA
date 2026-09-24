import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CustomerBookingsController } from './customer-bookings.controller';
import { ProviderBookingsController } from './provider-bookings.controller';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [LoyaltyModule, NotificationsModule, AnalyticsModule],
  controllers: [CustomerBookingsController, ProviderBookingsController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingsModule {}
