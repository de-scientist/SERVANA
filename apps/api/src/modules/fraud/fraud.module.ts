import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AIModule } from '../ai/ai.module';
import { FraudService } from './fraud.service';
import { FraudController } from './fraud.controller';

@Module({
  imports: [PrismaModule, AuditModule, AIModule],
  controllers: [FraudController],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}
