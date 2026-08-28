import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
} from '@nestjs/common';
import { ExpressRequest } from 'express';
import { UsersService } from './users.service';
import { AuditService } from '../audit/audit.service';
import { Authenticated, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { updateProfileSchema, type UpdateProfileInput } from './dto/profile.schema';
import { changePasswordSchema, changeEmailSchema } from '../auth/dto/auth.schema';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get('me')
  @Authenticated()
  async me(@CurrentUser() user: { sub: string }) {
    return { data: await this.users.getProfile(user.sub) };
  }

  @Patch('me')
  @Authenticated()
  async update(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileInput,
    @Req() req: ExpressRequest,
  ) {
    const before = await this.users.getProfile(user.sub);
    const after = await this.users.updateProfile(user.sub, dto);
    await this.audit.record({
      actorId: user.sub,
      action: 'user.profile.update',
      entity: 'user',
      entityId: user.sub,
      before: { name: before.name, phone: before.phone, profileImage: before.profileImage },
      after: dto,
      ip: req.ip,
    });
    return { data: after };
  }

  @Patch('me/password')
  @Authenticated()
  async changePassword(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: { currentPassword: string; password: string },
    @Req() req: ExpressRequest,
  ) {
    await this.users.changePassword(user.sub, dto.currentPassword, dto.password);
    await this.audit.record({
      actorId: user.sub,
      action: 'user.password.change',
      entity: 'user',
      entityId: user.sub,
      ip: req.ip,
    });
    return { data: { ok: true } };
  }

  @Patch('me/email')
  @Authenticated()
  async changeEmail(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(changeEmailSchema)) dto: { password: string; email: string },
    @Req() req: ExpressRequest,
  ) {
    const newEmail = await this.users.changeEmail(user.sub, dto.password, dto.email);
    await this.audit.record({
      actorId: user.sub,
      action: 'user.email.change',
      entity: 'user',
      entityId: user.sub,
      after: { email: newEmail },
      ip: req.ip,
    });
    return { data: { ok: true } };
  }
}
