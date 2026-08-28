import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logging/logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';

async function bootstrap(): Promise<void> {
  const logger = new AppLoggerService('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger });
  app.useLogger(logger);

  const port = Number(process.env.API_PORT ?? 3001);
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

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
