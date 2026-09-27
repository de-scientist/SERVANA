import { Module } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { ProvidersController } from './providers.controller';
import { ServicesController } from './services.controller';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/adapters/storage/storage.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AuditModule, StorageModule, AnalyticsModule],
  controllers: [ProvidersController, ServicesController],
  providers: [ProvidersService],
  exports: [ProvidersService],
})
export class ProvidersModule {}
