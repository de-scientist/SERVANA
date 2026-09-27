import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FraudService } from './fraud.service';
import { scanQuerySchema, alertsQuerySchema, reviewAlertSchema } from './dto/fraud.schema';

type Actor = { sub: string; role: string };

@Controller()
export class FraudController {
  constructor(private readonly fraud: FraudService) {}

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/fraud/scan')
  async scan(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(scanQuerySchema)) body: any) {
    return { data: await this.fraud.scan(user.sub, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/fraud/alerts')
  async list(@Query(new ZodValidationPipe(alertsQuerySchema)) query: any) {
    return this.fraud.list(query);
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/fraud/alerts/:id')
  async get(@Param('id') id: string) {
    return { data: await this.fraud.get(id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('admin/fraud/alerts/:id/annotate')
  async annotate(@CurrentUser() user: Actor, @Param('id') id: string) {
    return { data: await this.fraud.annotate(user.sub, id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/fraud/alerts/:id/review')
  async review(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewAlertSchema)) body: any,
  ) {
    return { data: await this.fraud.review(user.sub, user.role, id, body) };
  }
}
