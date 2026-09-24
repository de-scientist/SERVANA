import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const QUEUE_NAME = 'servana-default';

/** Job names processed by the notifications worker. */
export const JOB_NOTIFICATION_SEND = 'notification.send';
export const JOB_BOOKING_REMINDER = 'booking.reminder';

const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
} as const;

/**
 * Producer-only queue. Delivery jobs are durable (BullMQ + Redis) with
 * attempts + exponential backoff. When Redis is unavailable the producer
 * reports false and callers fall back to synchronous delivery — jobs are
 * never silently dropped. NOTE: this service owns NO worker; the
 * notifications module runs the worker so jobs are never acked unprocessed.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: Queue | null = null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log('REDIS_URL not set — queue disabled, callers use sync fallback');
      return;
    }

    try {
      const connection = new Redis(url, { maxRetriesPerRequest: null });
      connection.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
      this.queue = new Queue(QUEUE_NAME, { connection });
      this.logger.log('Queue producer initialized');
    } catch (err) {
      this.logger.warn(`Queue init failed (redis?): ${(err as Error).message}`);
    }
  }

  isAvailable(): boolean {
    return this.queue !== null;
  }

  /**
   * Enqueue a job with reliable-delivery defaults. Returns true when the job
   * is durably queued, false when the caller must deliver synchronously.
   */
  async add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<boolean> {
    if (!this.queue) {
      this.logger.debug(`Queue unavailable; caller must sync-deliver job ${name}`);
      return false;
    }
    try {
      await this.queue.add(name, data, { ...DEFAULT_JOB_OPTS, ...(opts ?? {}) } as never);
      return true;
    } catch (err) {
      this.logger.warn(`Queue add failed for ${name}: ${(err as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
