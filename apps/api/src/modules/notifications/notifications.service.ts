import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService, JOB_NOTIFICATION_SEND } from '../queue/queue.service';
import {
  NOTIFICATION_PROVIDER,
  NotificationProvider,
} from '../../common/adapters/notification/notification.provider';
import { DEFAULT_TEMPLATES } from './templates';
import { UpsertTemplateInput, InboxQuery } from './dto/notification.schema';

export type NotifyChannel = 'INAPP' | 'EMAIL' | 'SMS' | 'PUSH' | 'WHATSAPP';

/**
 * Template-driven notification engine.
 *
 * - Business logic calls notify(event, { userId, data }) — never message text.
 * - Active NotificationTemplate rows for the event decide the channels.
 * - INAPP persists synchronously (always available). External channels go
 *   through the durable queue (attempts + exponential backoff); when Redis is
 *   down the engine delivers synchronously instead of dropping the message.
 * - notify() never throws: communication must not break bookings or payments.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  async onModuleInit() {
    try {
      await this.seedTemplates();
    } catch {
      // DB may be unavailable in some contexts; seed lazily per notify.
    }
  }

  async seedTemplates() {
    const existing = await this.prisma.notificationTemplate.findMany({ select: { key: true } });
    const have = new Set(existing.map((t) => t.key));
    for (const t of DEFAULT_TEMPLATES) {
      if (have.has(t.key)) continue;
      await this.prisma.notificationTemplate.create({
        data: {
          key: t.key,
          event: t.event,
          channel: t.channel,
          subject: t.subject ?? null,
          body: t.body,
          active: true,
        },
      });
    }
  }

  /** Render {{placeholders}} from event data. Unknown vars become ''. */
  render(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
      const value = path.split('.').reduce<unknown>((acc, k) => {
        if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
          return (acc as Record<string, unknown>)[k];
        }
        return undefined;
      }, data);
      if (value === undefined || value === null) {
        this.logger.debug(`Missing template variable: ${path}`);
        return '';
      }
      return String(value);
    });
  }

  async notify(
    event: string,
    input: { userId: string; data?: Record<string, unknown> },
  ): Promise<Array<{ id: string; channel: string; status: string }>> {
    try {
      await this.seedTemplates();
      const templates = await this.prisma.notificationTemplate.findMany({
        where: { event, active: true },
      });
      if (!templates.length) {
        this.logger.debug(`No active templates for event ${event}`);
        return [];
      }
      const data = input.data ?? {};
      const out: Array<{ id: string; channel: string; status: string }> = [];
      for (const t of templates) {
        try {
          const row = await this.prisma.notification.create({
            data: {
              userId: input.userId,
              channel: t.channel,
              templateKey: t.key,
              subject: t.subject ? this.render(t.subject, data) : null,
              body: this.render(t.body, data),
              status: t.channel === 'INAPP' ? 'SENT' : 'PENDING',
            },
          });
          if (t.channel !== 'INAPP') {
            const queued = await this.queue.add(JOB_NOTIFICATION_SEND, { notificationId: row.id });
            if (!queued) {
              // Sync fallback: deliver now rather than lose the message.
              await this.sendNow(row.id);
              const refreshed = await this.prisma.notification.findUnique({ where: { id: row.id } });
              out.push({ id: row.id, channel: t.channel, status: refreshed?.status ?? 'PENDING' });
              continue;
            }
          }
          out.push({ id: row.id, channel: t.channel, status: t.channel === 'INAPP' ? 'SENT' : 'PENDING' });
        } catch (err) {
          this.logger.warn(`Notify failed for ${event}/${t.channel}: ${(err as Error).message}`);
        }
      }
      return out;
    } catch (err) {
      this.logger.warn(`notify(${event}) failed: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Deliver one external notification via the provider. Called by the worker
   * (throw → BullMQ retries with backoff) or the sync fallback (no throw —
   * records FAILED instead so callers stay safe).
   */
  async sendNow(notificationId: string, opts: { throwOnFailure?: boolean } = {}): Promise<void> {
    const row = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!row || row.status === 'SENT') return;
    try {
      const recipient = await this.resolveRecipient(row.userId, row.channel);
      const result = await this.provider.send({
        channel: row.channel as any,
        to: recipient,
        subject: row.subject ?? undefined,
        body: row.body,
        templateKey: row.templateKey ?? undefined,
        userId: row.userId,
      });
      await this.prisma.notification.update({
        where: { id: row.id },
        data: { status: 'SENT', attempts: { increment: 1 }, error: null },
      });
      this.logger.log(`Notification ${row.id} sent via ${row.channel} (${result.providerRef ?? 'no-ref'})`);
    } catch (err) {
      const message = (err as Error).message;
      await this.prisma.notification.update({
        where: { id: row.id },
        data: { status: 'FAILED', attempts: { increment: 1 }, error: message.slice(0, 500) },
      });
      this.logger.warn(`Notification ${row.id} failed: ${message}`);
      if (opts.throwOnFailure) throw err;
    }
  }

  private async resolveRecipient(userId: string, channel: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    if (!user) throw new Error('Recipient user not found');
    if (channel === 'EMAIL') {
      if (!user.email) throw new Error('User has no email address');
      return user.email;
    }
    if (channel === 'SMS' || channel === 'WHATSAPP') {
      if (!user.phone) throw new Error(`User has no phone number for ${channel}`);
      return user.phone;
    }
    if (channel === 'PUSH') {
      throw new Error('No push token registered for user');
    }
    throw new Error(`Unsupported channel ${channel}`);
  }

  // --- inbox --------------------------------------------------------------------------

  async inbox(userId: string, query: InboxQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: any = { userId };
    if (query.unreadOnly) where.read = false;
    const [rows, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return {
      data: rows.map((n) => ({
        id: n.id,
        channel: n.channel,
        subject: (n as any).subject ?? null,
        body: n.body,
        status: (n as any).status ?? 'SENT',
        read: n.read,
        createdAt: n.createdAt,
      })),
      meta: { page, pageSize, total, unread, pages: Math.ceil(total / pageSize) || 0 },
    };
  }

  async markRead(userId: string, id: string) {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Notification not found');
    if (row.userId !== userId) throw new ForbiddenException('Not your notification');
    await this.prisma.notification.update({ where: { id }, data: { read: true } });
    return { id, read: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { marked: result.count };
  }

  // --- admin: templates -------------------------------------------------------------------

  async listTemplates() {
    return this.prisma.notificationTemplate.findMany({ orderBy: [{ event: 'asc' }, { channel: 'asc' }] });
  }

  async upsertTemplate(actorId: string, input: UpsertTemplateInput) {
    const key = `${input.event.trim().toUpperCase()}:${input.channel}`;
    const tpl = await this.prisma.notificationTemplate.upsert({
      where: { key },
      update: { subject: input.subject ?? null, body: input.body, active: input.active ?? true },
      create: {
        key,
        event: input.event.trim().toUpperCase(),
        channel: input.channel,
        subject: input.subject ?? null,
        body: input.body,
        active: input.active ?? true,
      },
    });
    await this.audit.record({
      actorId, action: 'notificationTemplate.upsert', entity: 'notificationTemplate', entityId: tpl.id,
      after: { key, active: tpl.active },
    });
    return tpl;
  }
}
