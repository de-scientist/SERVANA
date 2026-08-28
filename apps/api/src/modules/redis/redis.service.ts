import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { appendFileSync } from 'fs';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (url) {
      try {
        this.client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
        this.client.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
      } catch (err) {
        this.logger.warn(`Redis not initialized: ${(err as Error).message}`);
      }
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.client) {
      try {
        appendFileSync('E:/SERVANA/apps/api/boot_trace.log', 'redis init start\n');
        await this.client.connect();
        appendFileSync('E:/SERVANA/apps/api/boot_trace.log', 'redis init done\n');
        this.logger.log('Redis connected');
      } catch (err) {
        appendFileSync(
          'E:/SERVANA/apps/api/boot_trace.log',
          `redis init error: ${(err as Error).message}\n`,
        );
        this.logger.warn(`Redis connect failed: ${(err as Error).message}`);
      }
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
