import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from './ai.service';
import { RecommendationService } from './recommendation.service';
import { MatchingService } from './matching.service';
import { AssistantService } from './assistant.service';
import { AdminAssistantService } from './admin-assistant.service';
import { ModerationService } from './moderation.service';
import { AIAnalyticsService } from './ai-analytics.service';
import { AIActionService } from './ai-action.service';
import {
  recommendProvidersSchema,
  recommendServicesSchema,
  recommendProductsSchema,
  matchSchema,
  explainSchema,
  marketingDraftSchema,
  reviewInsightsSchema,
  moderateSchema,
  proposeActionSchema,
  reviewProposalSchema,
  usageQuerySchema,
} from './dto/ai.schema';
import {
  assistantChatSchema,
  adminAskSchema,
  providerAssistSchema,
} from './dto/assistant.schema';

type Actor = { sub: string; role: string };

@Controller()
export class AIController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly recommendations: RecommendationService,
    private readonly matching: MatchingService,
    private readonly assistant: AssistantService,
    private readonly adminAssistant: AdminAssistantService,
    private readonly moderation: ModerationService,
    private readonly analytics: AIAnalyticsService,
    private readonly actions: AIActionService,
  ) {}

  // --- recommendations (deterministic v1; ML rerank later, same contract) ----------

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('ai/recommend/providers')
  async recommendProviders(
    @CurrentUser() user: Actor,
    @Body(new ZodValidationPipe(recommendProvidersSchema)) body: any,
  ) {
    return { data: await this.recommendations.recommendProviders(user.sub, body) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('ai/recommend/services')
  async recommendServices(
    @CurrentUser() user: Actor,
    @Body(new ZodValidationPipe(recommendServicesSchema)) body: any,
  ) {
    return { data: await this.recommendations.recommendServices(user.sub, body) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('ai/recommend/products')
  async recommendProducts(
    @CurrentUser() user: Actor,
    @Body(new ZodValidationPipe(recommendProductsSchema)) body: any,
  ) {
    return { data: await this.recommendations.recommendProducts(user.sub, body) };
  }

  // --- smart matching: natural language → database rows (never invented) ----------

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('ai/match')
  async match(
    @CurrentUser() user: Actor,
    @Body(new ZodValidationPipe(matchSchema)) body: any,
  ) {
    return { data: await this.matching.match(user.sub, body.query, body.limit) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('ai/recommend/explain')
  async explain(
    @CurrentUser() user: Actor,
    @Body(new ZodValidationPipe(explainSchema)) body: any,
  ) {
    return { data: await this.matching.explain(user.sub, body.itemType, body.itemId) };
  }

  // --- customer assistant: controlled chat, confirmations for irreversible acts ----------

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('ai/assistant/chat')
  async assistantChat(
    @CurrentUser() user: Actor,
    @Body(new ZodValidationPipe(assistantChatSchema)) body: any,
  ) {
    return { data: await this.assistant.chat(user.sub, body.message, body.history ?? []) };
  }

  // --- provider assistant: drafts only, never publishes -------------------------------------

  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN')
  @Post('ai/assistant/provider')
  async providerAssist(
    @CurrentUser() user: Actor,
    @Body(new ZodValidationPipe(providerAssistSchema)) body: any,
  ) {
    if (user.role !== 'PROVIDER') {
      const err: any = new Error('Providers use this for their own profile.');
      err.status = 403;
      throw err;
    }
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');
    switch (body.kind) {
      case 'service-description':
        return {
          data: {
            ...(await this.analytics.serviceDescription(user.sub, profile.id, {
              serviceName: body.topic ?? 'Signature service',
              tone: body.tone,
            })),
            published: false,
          },
        };
      case 'promotion-copy':
        return {
          data: {
            ...(await this.analytics.promotionMessage(user.sub, profile.id, {
              offer: body.topic ?? 'Special offer',
              channel: 'instagram',
              tone: body.tone,
            })),
            published: false,
          },
        };
      case 'instagram-caption':
        return {
          data: {
            ...(await this.analytics.marketingDraft(user.sub, profile.id, {
              topic: body.topic ?? 'New looks',
              tone: body.tone,
            })),
            published: false,
          },
        };
      case 'whatsapp-message':
        return {
          data: {
            ...(await this.analytics.promotionMessage(user.sub, profile.id, {
              offer: body.topic ?? 'Special offer',
              channel: 'whatsapp',
              tone: body.tone,
            })),
            published: false,
          },
        };
      case 'performance-explainer':
      default:
        return { data: await this.analytics.performanceExplainer(profile.id) };
    }
  }

  // --- admin assistant: controlled analytics tools, never raw SQL ------------------------------

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/ai/ask')
  async adminAsk(
    @CurrentUser() user: Actor,
    @Body(new ZodValidationPipe(adminAskSchema)) body: any,
  ) {
    return { data: await this.adminAssistant.ask(user.sub, body.question) };
  }

  // --- provider intelligence -----------------------------------------------------------------

  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN')
  @Post('ai/marketing/draft')
  async marketingDraft(
    @CurrentUser() user: Actor,
    @Body(new ZodValidationPipe(marketingDraftSchema)) body: any,
  ) {
    // Providers draft for their OWN profile only (resolved server-side).
    if (user.role !== 'PROVIDER') {
      const err: any = new Error('Providers draft for their own profile.');
      err.status = 403;
      throw err;
    }
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');
    return { data: await this.analytics.marketingDraft(user.sub, profile.id, body) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('ai/reviews/insights')
  async reviewInsights(
    @CurrentUser() user: Actor,
    @Body(new ZodValidationPipe(reviewInsightsSchema)) body: any,
  ) {
    return { data: await this.analytics.reviewInsights(body.providerId) };
  }

  // --- moderation -------------------------------------------------------------------------------

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('ai/moderate')
  async moderate(@Body(new ZodValidationPipe(moderateSchema)) body: any) {
    return { data: await this.moderation.moderate(body.text) };
  }

  // --- human-confirmation gate ---------------------------------------------------------------------

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('ai/actions/propose')
  async propose(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(proposeActionSchema)) body: any) {
    return { data: await this.actions.propose(user.sub, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Get('admin/ai/actions')
  async listActions(@Query('status') status?: string) {
    return { data: await this.actions.list(status) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/ai/actions/:id/review')
  async reviewAction(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewProposalSchema)) body: any,
  ) {
    return { data: await this.actions.review(user.sub, user.role, id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/ai/actions/:id/execute')
  async executeAction(@CurrentUser() user: Actor, @Param('id') id: string) {
    return { data: await this.actions.execute(user.sub, user.role, id) };
  }

  // --- cost + oversight -------------------------------------------------------------------------------

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Get('admin/ai/usage')
  async usage(@Query(new ZodValidationPipe(usageQuerySchema)) query: any) {
    return { data: await this.ai.usage(query) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Get('admin/ai/churn/:userId')
  async churn(@Param('userId') userId: string) {
    return { data: await this.analytics.churnScore(userId) };
  }
}
