import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ROLES_KEY = 'servana:roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    // No role requirement → any authenticated caller passes.
    if (!required.length) return true;

    const req = context.switchToHttp().getRequest<{ user?: { roles?: string[] } }>();
    const user = req.user;
    if (!user || !user.roles) throw new UnauthorizedException('Missing identity');

    const allowed = required.some((role) => user.roles!.includes(role));
    if (!allowed) throw new ForbiddenException('Insufficient role for this action');
    return true;
  }
}
