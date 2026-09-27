import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';
import { ProvidersModule } from '../providers/providers.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [ProvidersModule, AnalyticsModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
