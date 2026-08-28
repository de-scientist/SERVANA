import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

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
        await this.client.connect();
        this.logger.log('Redis connected');
      } catch (err) {
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
