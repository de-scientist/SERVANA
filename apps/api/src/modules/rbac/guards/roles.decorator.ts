import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'servana:roles';

/** Restrict a route to callers holding at least one of the given roles. */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
