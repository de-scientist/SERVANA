import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database');
    } catch (err) {
      // Boot without a live DB in development/foundation; health check reports status.
      this.logger.warn(
        `Prisma could not connect at startup: ${(err as Error).message}. ` +
          `Ensure DATABASE_URL is reachable before using data features.`,
      );
    }
  }
}
