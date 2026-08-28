import 'reflect-metadata';
import { appendFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logging/logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';

function trace(msg: string): void {
  try {
    appendFileSync('E:/SERVANA/apps/api/boot_trace.log', `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* ignore */
  }
}

trace('main module loaded');

async function bootstrap(): Promise<void> {
  trace('before NestFactory.create');
  const logger = new AppLoggerService('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger });
  app.useLogger(logger);
  trace('after NestFactory.create');

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
  trace('listen resolved');
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
