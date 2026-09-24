import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logging/logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { assertProductionSecrets } from './common/security/startup';

async function bootstrap(): Promise<void> {
  const logger = new AppLoggerService('Bootstrap');
  assertProductionSecrets();
  const app = await NestFactory.create(AppModule, { logger });
  app.useLogger(logger);
  app.use(helmet());

  const port = Number(process.env.API_PORT ?? 3001);
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production' && origins.some((o) => o === '*')) {
    throw new Error('Refusing to boot in production with CORS origin *');
  }

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: origins, credentials: true });
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
