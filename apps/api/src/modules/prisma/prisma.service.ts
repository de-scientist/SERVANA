import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { appendFileSync } from 'fs';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      appendFileSync('E:/SERVANA/apps/api/boot_trace.log', 'prisma init start\n');
      await this.$connect();
      appendFileSync('E:/SERVANA/apps/api/boot_trace.log', 'prisma init done\n');
      this.logger.log('Prisma connected to database');
    } catch (err) {
      appendFileSync(
        'E:/SERVANA/apps/api/boot_trace.log',
        `prisma init error: ${(err as Error).message}\n`,
      );
      // Boot without a live DB in development/foundation; health check reports status.
      this.logger.warn(
        `Prisma could not connect at startup: ${(err as Error).message}. ` +
          `Ensure DATABASE_URL is reachable before use.`,
      );
    }
  }
}
