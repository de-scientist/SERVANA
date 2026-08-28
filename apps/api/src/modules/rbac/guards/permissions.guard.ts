import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../rbac.service';

export const PERMISSIONS_KEY = 'servana:permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!required.length) return true;

    const req = context.switchToHttp().getRequest<{ user?: { sub?: string } }>();
    const user = req.user;
    if (!user?.sub) throw new UnauthorizedException('Missing identity');

    const granted = await this.rbac.getPermissions(user.sub);
    const allowed = required.every((perm) => this.rbac.hasPermission(granted, perm));
    if (!allowed) throw new ForbiddenException('Missing required permission');
    return true;
  }
}
