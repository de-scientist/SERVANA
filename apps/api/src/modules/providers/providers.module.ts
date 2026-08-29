import { Module } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { ProvidersController } from './providers.controller';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/adapters/storage/storage.module';

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [ProvidersController],
  providers: [ProvidersService],
  exports: [ProvidersService],
})
export class ProvidersModule {}
