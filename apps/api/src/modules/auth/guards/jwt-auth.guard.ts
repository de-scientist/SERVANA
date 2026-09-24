import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.substring(7);
    try {
      // SECURITY: must use the same secret resolution as AuthService
      // (dev fallback only; production refuses weak secrets at boot).
      // Pin the algorithm to HS256 so no `alg` confusion is possible.
      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'change_me_access',
        algorithms: ['HS256'],
      });
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
