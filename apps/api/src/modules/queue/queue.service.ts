import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

export const QUEUE_NAME = 'servana-default';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: Queue | null = null;
  private readonly worker: Worker | null = null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) return;

    try {
      const connection = new Redis(url, { maxRetriesPerRequest: null });
      this.queue = new Queue(QUEUE_NAME, { connection });

      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          this.logger.log(`Processing job ${job.name} id=${job.id}`);
        },
        { connection },
      );

      this.worker.on('error', (err) => this.logger.warn(`Queue worker error: ${err.message}`));
      this.logger.log('Queue + worker initialized');
    } catch (err) {
      this.logger.warn(`Queue init failed (redis?): ${(err as Error).message}`);
    }
  }

  async add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<void> {
    if (!this.queue) {
      this.logger.debug(`Queue unavailable; skipping job ${name}`);
      return;
    }
    await this.queue.add(name, data, opts as never);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
