import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'servana:permissions';

/** Restrict a route to callers holding all of the given permission keys. */
export const Permissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
