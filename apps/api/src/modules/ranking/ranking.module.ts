import { Module } from '@nestjs/common';
import { RankingService } from './ranking.service';
import { RankingController } from './ranking.controller';
import { AuditModule } from '../audit/audit.module';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [AuditModule, ReviewsModule],
  controllers: [RankingController],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
