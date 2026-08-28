import 'express';
import type { AuthUser } from '../../modules/auth/guards/auth-user';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
