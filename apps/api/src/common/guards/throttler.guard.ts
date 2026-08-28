import { Injectable, type CanActivate, type ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppLoggerService } from '../logging/logger.service';

export const THROTTLE_KEY = 'servana:throttle';

export interface ThrottleOptions {
  /** Max requests within the window. */
  limit: number;
  /** Window size in seconds. */
  ttl: number;
}

/**
 * Per-route override applied via `@Throttle(limit, ttl)` or `@Throttle({ limit, ttl })`.
 * Falls back to the global default when not present.
 */
export const Throttle = (limitOrOptions: number | ThrottleOptions, maybeTtl?: number): MethodDecorator & ClassDecorator => {
  const options: ThrottleOptions =
    typeof limitOrOptions === 'number'
      ? { limit: limitOrOptions, ttl: maybeTtl ?? 60 }
      : limitOrOptions;
  return (target: object, propertyKey?: string | symbol) => {
    if (propertyKey) {
      Reflect.defineMetadata(THROTTLE_KEY, options, target, propertyKey);
    } else {
      Reflect.defineMetadata(THROTTLE_KEY, options, target);
    }
  };
};

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Lightweight in-memory rate limiter (no external dependency). Counts requests
 * per `ip:route` over a rolling TTL window. Suitable for a single instance;
 * swap for Redis-backed limiting in a multi-node deployment (see docs/SECURITY.md).
 */
@Injectable()
export class ThrottlerGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private readonly defaultLimit = Number(process.env.RATE_LIMIT_DEFAULT ?? 20);
  private readonly defaultTtl = Number(process.env.RATE_LIMIT_TTL ?? 60);

  constructor(
    private readonly reflector: Reflector,
    private readonly logger: AppLoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ ip?: string; method?: string; url?: string }>();
    const handler = context.getHandler();
    const cls = context.getClass();

    const options =
      (this.reflector.get<ThrottleOptions>(THROTTLE_KEY, handler) ??
        this.reflector.get<ThrottleOptions>(THROTTLE_KEY, cls)) ?? {
        limit: this.defaultLimit,
        ttl: this.defaultTtl,
      };

    const key = `${req.ip ?? 'unknown'}:${req.method ?? 'GET'}:${req.url ?? ''}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.ttl * 1000 });
      return true;
    }

    if (bucket.count >= options.limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      this.logger.warn(`Rate limit exceeded for ${key}`);
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many requests, slow down.', retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    return true;
  }
}
