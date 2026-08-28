import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logging/logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// eslint-disable-next-line no-console
console.log('[BOOT] main module loaded');

async function bootstrap(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[BOOT] before NestFactory.create');
  const logger = new AppLoggerService('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger });
  app.useLogger(logger);
  // eslint-disable-next-line no-console
  console.log('[BOOT] after NestFactory.create');

  const port = Number(process.env.API_PORT ?? 3001);
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log('[BOOT] listen resolved');
  logger.log(`API listening on http://localhost:${port}/api/v1`);
  logger.log(`Health: http://localhost:${port}/api/v1/health`);

  // Foundation boot-test mode: exit shortly after listening so CI can verify startup.
  if (process.env.BOOT_TEST === '1') {
    setTimeout(() => process.exit(0), 1500);
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap API', err);
  process.exit(1);
});
