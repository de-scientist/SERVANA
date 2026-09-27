import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { QUEUE_NAME, JOB_NOTIFICATION_SEND, JOB_BOOKING_REMINDER } from '../queue/queue.service';

/**
 * Background delivery worker. Picks up durable notification jobs and
 * scheduled booking reminders. sendNow throws on failure so BullMQ applies
 * the producer's attempts + exponential backoff; poison jobs exhaust retries
 * and land in the FAILED set for inspection instead of looping forever.
 */
@Injectable()
export class NotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsWorker.name);
  private worker: Worker | null = null;
  private connection: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log('REDIS_URL not set — worker disabled, engine uses sync fallback');
      return;
    }
    try {
      this.connection = new Redis(url, { maxRetriesPerRequest: null });
      this.connection.on('error', (err) => this.logger.warn(`Worker redis error: ${err.message}`));
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => this.process(job.name, job.data as Record<string, any>),
        { connection: this.connection, concurrency: 5 },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.warn(`Job ${job?.name} ${job?.id} failed: ${err.message}`),
      );
      this.logger.log('Notifications worker started');
    } catch (err) {
      this.logger.warn(`Worker init failed: ${(err as Error).message}`);
    }
  }

  private async process(name: string, data: Record<string, any>): Promise<void> {
    if (name === JOB_NOTIFICATION_SEND) {
      if (!data?.notificationId) throw new Error('notification.send job missing notificationId');
      await this.notifications.sendNow(data.notificationId, { throwOnFailure: true });
      return;
    }
    if (name === JOB_BOOKING_REMINDER) {
      if (!data?.bookingId) throw new Error('booking.reminder job missing bookingId');
      await this.sendReminder(data.bookingId);
      return;
    }
    this.logger.debug(`Ignoring unknown job ${name}`);
  }

  private async sendReminder(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        providerService: { include: { provider: { select: { businessName: true } } } },
      },
    });
    if (!booking) return;
    // Only remind for bookings still awaiting the service.
    if (!['PAID', 'CONFIRMED', 'PROVIDER_ACCEPTED'].includes(booking.status)) return;
    await this.notifications.notify('BOOKING_REMINDER', {
      userId: booking.customerId,
      data: {
        reference: booking.reference,
        serviceName: (booking as any).providerService?.name ?? 'your service',
        startsAt: booking.startsAt.toISOString(),
        providerName: (booking as any).providerService?.provider?.businessName ?? 'your provider',
        customerName: '',
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    if (this.connection) this.connection.disconnect();
  }
}
