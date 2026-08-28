import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginInput, RegisterInput, loginSchema, registerSchema } from './dto/auth.schema';
import { Authenticated, CurrentUser } from './guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput) {
    const user = await this.auth.register(dto);
    return { data: user };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginInput) {
    const tokens = await this.auth.login(dto);
    return { data: tokens };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: { refreshToken: string }) {
    const tokens = await this.auth.refresh(body.refreshToken);
    return { data: tokens };
  }

  @Get('me')
  @Authenticated()
  async me(@CurrentUser() user: { sub: string; email: string }) {
    return {
      data: {
        id: user.sub,
        email: user.email,
      },
    };
  }

  @Get('session')
  @Authenticated()
  session(@Req() req: Request) {
    return { data: req.user };
  }
}
