import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';
import { inboxQuerySchema, upsertTemplateSchema } from './dto/notification.schema';

type Actor = { sub: string; role: string };

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('notifications')
  async inbox(@CurrentUser() user: Actor, @Query(new ZodValidationPipe(inboxQuerySchema)) query: any) {
    return this.notifications.inbox(user.sub, query);
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Patch('notifications/:id/read')
  async markRead(@CurrentUser() user: Actor, @Param('id') id: string) {
    return { data: await this.notifications.markRead(user.sub, id) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('notifications/read-all')
  async markAllRead(@CurrentUser() user: Actor) {
    return { data: await this.notifications.markAllRead(user.sub) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Get('admin/notification-templates')
  async listTemplates() {
    return { data: await this.notifications.listTemplates() };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/notification-templates')
  async upsertTemplate(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(upsertTemplateSchema)) body: any) {
    return { data: await this.notifications.upsertTemplate(user.sub, body) };
  }
}
