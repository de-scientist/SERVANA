import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard, ROLES_KEY } from './roles.guard';

function ctx(user: unknown, handler: object, cls: object) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => cls,
  } as any;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const adminHandler = {};
  Reflect.defineMetadata(ROLES_KEY, ['ADMIN', 'SUPER_ADMIN'], adminHandler);

  it('allows a user holding a required role', () => {
    expect(guard.canActivate(ctx({ sub: 'u1', roles: ['ADMIN'] }, adminHandler, {}))).toBe(true);
  });

  it('throws ForbiddenException when role is missing', () => {
    expect(() => guard.canActivate(ctx({ sub: 'u1', roles: ['CUSTOMER'] }, adminHandler, {}))).toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException when no identity present', () => {
    expect(() => guard.canActivate(ctx(undefined, adminHandler, {}))).toThrow(UnauthorizedException);
  });

  it('allows any authenticated user when no role is required', () => {
    expect(guard.canActivate(ctx({ sub: 'u1', roles: ['CUSTOMER'] }, {}, {}))).toBe(true);
  });
});
