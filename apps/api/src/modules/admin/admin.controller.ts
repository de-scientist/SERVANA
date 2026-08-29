import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { ProvidersService } from '../providers/providers.service';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { setStatusSchema } from '../users/dto/profile.schema';
import { setProviderStatusSchema, type SetProviderStatusInput } from '../providers/dto/provider.schema';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly providers: ProvidersService,
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

  // --- provider management -------------------------------------------------

  @Get('providers')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async listProviders(
    @Query('status') status: string | undefined,
    @Query('q') q: string | undefined,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return await this.providers.listAllProviders({
      status,
      q,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
  }

  @Get('providers/:id')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async getProvider(@Param('id') id: string) {
    return { data: await this.providers.getProviderAdmin(id) };
  }

  @Patch('providers/:id/status')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async setProviderStatus(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string },
    @Body(new ZodValidationPipe(setProviderStatusSchema)) dto: SetProviderStatusInput,
    @Req() req: ExpressRequest,
  ) {
    const result = await this.providers.setProviderStatus(actor.sub, id, dto.status, dto.note);
    return result;
  }
}
