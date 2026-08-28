import {
  Body,
  Controller,
  Param,
  Patch,
  Get,
  Req,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { setStatusSchema } from '../users/dto/profile.schema';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async listUsers() {
    return { data: await this.users.list() };
  }

  @Patch('users/:id/status')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async setStatus(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string },
    @Body(new ZodValidationPipe(setStatusSchema)) dto: { status: string },
    @Req() req: ExpressRequest,
  ) {
    await this.users.setStatus(id, dto.status);
    await this.audit.record({
      actorId: actor.sub,
      action: 'user.status.change',
      entity: 'user',
      entityId: id,
      after: { status: dto.status },
      ip: req.ip,
    });
    return { data: { ok: true } };
  }
}
