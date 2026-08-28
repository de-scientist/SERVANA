import { applyDecorators, createParamDecorator, ExecutionContext, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/** Inject the authenticated JWT payload (`{ sub, email, roles }`). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<{ user?: unknown }>();
  return req.user;
});

/** Protect a route with the JWT auth guard. */
export function Authenticated(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(JwtAuthGuard));
}
