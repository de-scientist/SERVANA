import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logging/logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { assertProductionSecrets } from './common/security/startup';

async function bootstrap(): Promise<void> {
  const logger = new AppLoggerService('Bootstrap');
  assertProductionSecrets();
  const app = await NestFactory.create(AppModule, { logger, rawBody: true });
  app.useLogger(logger);
  // SECURITY: hardened HTTP headers (HSTS in prod, no sniffing, framedeny,
  // strict CSP for an API — no inline scripts needed).
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginEmbedderPolicy: false,
      hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.disable('x-powered-by');

  const port = Number(process.env.API_PORT ?? 3001);
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production' && origins.some((o) => o === '*')) {
    throw new Error('Refusing to boot in production with CORS origin *');
  }

  app.setGlobalPrefix('api/v1');
  // SECURITY: capture the exact raw body for webhook HMAC verification
  // BEFORE any parsing mutates whitespace/key order.
  app.use(
    json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Pay-Signature'],
    maxAge: 600,
  });
  // Global validation is Zod-based per-route (see ZodValidationPipe). The global
  // pipe is a safe pass-through; routes attach a schema via @Body(new ZodValidationPipe(schema)).
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api/v1`);
  logger.log(`Health: http://localhost:${port}/api/v1/health`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap API', err);
  process.exit(1);
});
