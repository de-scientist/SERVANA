import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './dto/auth.schema';
import { Authenticated, Auth, CurrentUser } from './guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Throttle } from '../../common/guards/throttler.guard';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './dto/auth.schema';

function ipOf(req: ExpressRequest): string | undefined {
  return req.ip;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Post('register')
  @Throttle(5, 60)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput,
    @Req() req: ExpressRequest,
  ) {
    const result = await this.auth.register(dto, ipOf(req));
    return { data: result };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(10, 60)
  async login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginInput, @Req() req: ExpressRequest) {
    return { data: await this.auth.login(dto, ipOf(req)) };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(20, 60)
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string }, @Req() req: ExpressRequest) {
    return { data: await this.auth.refresh(body.refreshToken) };
  }

  @Post('logout')
  @HttpCode(200)
  @Authenticated()
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string }, @Req() req: ExpressRequest) {
    await this.auth.logout(body.refreshToken, ipOf(req));
    return { data: { ok: true } };
  }

  @Post('logout-all')
  @HttpCode(200)
  @Authenticated()
  async logoutAll(@CurrentUser() user: { sub: string }, @Req() req: ExpressRequest) {
    await this.auth.revokeAllSessions(user.sub, ipOf(req));
    return { data: { ok: true } };
  }

  @Get('sessions')
  @Authenticated()
  async sessions(@CurrentUser() user: { sub: string }) {
    return { data: await this.auth.listSessions(user.sub) };
  }

  @Delete('sessions')
  @Authenticated()
  async deleteSessions(@CurrentUser() user: { sub: string }, @Req() req: ExpressRequest) {
    await this.auth.revokeAllSessions(user.sub, ipOf(req));
    return { data: { ok: true } };
  }

  @Delete('sessions/:id')
  @Authenticated()
  async deleteSession(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Req() req: ExpressRequest,
  ) {
    await this.auth.revokeSession(user.sub, id, ipOf(req));
    return { data: { ok: true } };
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle(5, 60)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordInput,
    @Req() req: ExpressRequest,
  ) {
    await this.auth.forgotPassword(dto, ipOf(req));
    return { data: { ok: true } };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle(5, 60)
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordInput, @Req() req: ExpressRequest) {
    await this.auth.resetPassword(dto, ipOf(req));
    return { data: { ok: true } };
  }

  @Post('verify-email')
  @HttpCode(200)
  @Throttle(10, 60)
  async verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) dto: VerifyEmailInput, @Req() req: ExpressRequest) {
    await this.auth.verifyEmail(dto, ipOf(req));
    return { data: { ok: true } };
  }

  @Post('resend-verification')
  @HttpCode(200)
  @Throttle(5, 60)
  async resendVerification(
    @Body(new ZodValidationPipe(resendVerificationSchema)) dto: ResendVerificationInput,
    @Req() req: ExpressRequest,
  ) {
    await this.auth.resendVerification(dto, ipOf(req));
    return { data: { ok: true } };
  }

  @Get('me')
  @Authenticated()
  async me(@CurrentUser() user: { sub: string }) {
    return { data: await this.users.getProfile(user.sub) };
  }

  @Get('session')
  @Authenticated()
  session(@Req() req: ExpressRequest) {
    return { data: req.user };
  }
}
