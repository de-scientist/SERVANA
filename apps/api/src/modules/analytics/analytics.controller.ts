import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AnalyticsService } from './analytics.service';
import { rangeQuerySchema, eventsQuerySchema, trackAttributionSchema } from './dto/analytics.schema';

type Actor = { sub: string; role: string };

@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Public landing touchpoint: utm_* / referral / provider page attribution. */
  @Post('attribution/track')
  async track(
    @CurrentUser() user: { sub?: string } | undefined,
    @Body(new ZodValidationPipe(trackAttributionSchema)) body: any,
  ) {
    return {
      data: await this.analytics.trackAttribution({ ...body, userId: user?.sub ?? null }),
    };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/analytics/overview')
  async overview(@Query(new ZodValidationPipe(rangeQuerySchema)) query: any) {
    return { data: await this.analytics.overview(query) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/analytics/funnel')
  async funnel(@Query(new ZodValidationPipe(rangeQuerySchema)) query: any) {
    return { data: await this.analytics.funnel(query) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/analytics/providers')
  async providers(@Query() query: { limit?: string }) {
    return {
      data: await this.analytics.providers({ limit: query.limit ? Number(query.limit) : undefined }),
    };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/analytics/products')
  async products(@Query(new ZodValidationPipe(rangeQuerySchema)) query: any) {
    return { data: await this.analytics.products(query) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/analytics/attribution')
  async attribution(@Query(new ZodValidationPipe(rangeQuerySchema)) query: any) {
    return { data: await this.analytics.attribution(query) };
  }

  /** Raw event feed for future recommendation/prediction models. */
  @Auth('ADMIN', 'SUPER_ADMIN')
  @Get('admin/analytics/events')
  async events(@Query(new ZodValidationPipe(eventsQuerySchema)) query: any) {
    return this.analytics.events(query);
  }
}
