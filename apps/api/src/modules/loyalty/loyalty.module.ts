import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { LoggingModule } from '../../common/logging/logging.module';
import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';
import { PromotionService } from './promotion.service';
import { LoyaltyController } from './loyalty.controller';

@Module({
  imports: [PrismaModule, AuditModule, LoggingModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, ReferralService, PromotionService],
  exports: [LoyaltyService, ReferralService, PromotionService],
})
export class LoyaltyModule {}
