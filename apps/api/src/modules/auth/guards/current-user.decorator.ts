import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { Roles } from '../../rbac/guards/roles.decorator';

/** Inject the authenticated JWT payload (`{ sub, email, roles }`). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<{ user?: unknown }>();
  return req.user;
});

/** Protect a route with the JWT auth guard (any authenticated user). */
export function Authenticated(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(JwtAuthGuard));
}

/**
 * Protect a route: requires a valid JWT AND (optionally) one of the given roles.
 * Roles are resolved server-side from the DB at token issuance — never trusted
 * from the client.
 */
export function Auth(...roles: string[]): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(...roles));
}
