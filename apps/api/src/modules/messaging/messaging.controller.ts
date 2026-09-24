import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MessagingService } from './messaging.service';
import {
  openThreadSchema,
  sendMessageSchema,
  messagesQuerySchema,
  reportConversationSchema,
  reviewReportSchema,
  reportsQuerySchema,
} from './dto/messaging.schema';

type Actor = { sub: string; role: string };

const PARTICIPANT_ROLES = ['CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT'] as const;

@Controller()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Auth(...PARTICIPANT_ROLES)
  @Post('conversations')
  async open(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(openThreadSchema)) body: any) {
    return { data: await this.messaging.openThread({ sub: user.sub, role: user.role }, body.bookingId) };
  }

  @Auth(...PARTICIPANT_ROLES)
  @Get('conversations/mine')
  async mine(@CurrentUser() user: Actor) {
    return { data: await this.messaging.listMine({ sub: user.sub, role: user.role }) };
  }

  // Static admin routes before ':id' siblings (same pattern as payouts).
  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/conversation-reports')
  async reports(
    @CurrentUser() user: Actor,
    @Query(new ZodValidationPipe(reportsQuerySchema)) query: any,
  ) {
    return this.messaging.listReports({ sub: user.sub, role: user.role }, query);
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Patch('admin/conversation-reports/:id')
  async reviewReport(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewReportSchema)) body: any,
  ) {
    return { data: await this.messaging.reviewReport({ sub: user.sub, role: user.role }, id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/conversations/:id/messages')
  async adminMessages(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) query: any,
  ) {
    return this.messaging.adminGetMessages({ sub: user.sub, role: user.role }, id, query);
  }

  @Auth(...PARTICIPANT_ROLES)
  @Get('conversations/:id/messages')
  async messages(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) query: any,
  ) {
    return this.messaging.getMessages({ sub: user.sub, role: user.role }, id, query);
  }

  @Auth(...PARTICIPANT_ROLES)
  @Post('conversations/:id/messages')
  async send(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: any,
  ) {
    return { data: await this.messaging.send({ sub: user.sub, role: user.role }, id, body.body) };
  }

  @Auth(...PARTICIPANT_ROLES)
  @Post('conversations/:id/report')
  async report(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reportConversationSchema)) body: any,
  ) {
    return { data: await this.messaging.report({ sub: user.sub, role: user.role }, id, body.reason) };
  }

  @Auth(...PARTICIPANT_ROLES)
  @Patch('messages/:id/read')
  async markRead(@CurrentUser() user: Actor, @Param('id') id: string) {
    return { data: await this.messaging.markRead({ sub: user.sub, role: user.role }, id) };
  }
}
