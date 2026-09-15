import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/adapters/storage/storage.module';

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
