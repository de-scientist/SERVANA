import 'express';
import type { AuthUser } from '../../modules/auth/guards/auth-user';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Exact raw request bytes (captured for webhook HMAC verification). */
      rawBody?: string;
    }
  }
}

export {};
