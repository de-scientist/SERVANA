import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CustomerBookingsController } from './customer-bookings.controller';
import { ProviderBookingsController } from './provider-bookings.controller';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [LoyaltyModule],
  controllers: [CustomerBookingsController, ProviderBookingsController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingsModule {}
