import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { LoggingModule } from '../../common/logging/logging.module';
import { AiModule } from '../../common/adapters/ai/ai.module';
import { AIService } from './ai.service';
import { RecommendationService } from './recommendation.service';
import { MatchingService } from './matching.service';
import { AssistantService } from './assistant.service';
import { AdminAssistantService } from './admin-assistant.service';
import { EmbeddingService } from './embedding.service';
import { ModerationService } from './moderation.service';
import { AIAnalyticsService } from './ai-analytics.service';
import { AIActionService } from './ai-action.service';
import { AIController } from './ai.controller';

@Module({
  imports: [PrismaModule, AuditModule, LoggingModule, AiModule],
  controllers: [AIController],
  providers: [
    AIService,
    RecommendationService,
    MatchingService,
    AssistantService,
    AdminAssistantService,
    EmbeddingService,
    ModerationService,
    AIAnalyticsService,
    AIActionService,
  ],
  exports: [AIService, RecommendationService, MatchingService, AssistantService, AdminAssistantService, EmbeddingService, ModerationService, AIAnalyticsService, AIActionService],
})
export class AIModule {}
