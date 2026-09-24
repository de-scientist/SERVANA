import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MessagesQuery, ReviewReportInput } from './dto/messaging.schema';

export interface MessageActor {
  sub: string;
  role: string;
}

/**
 * Booking-linked conversations. Exactly one thread per booking between the
 * customer (user id) and the provider (user id) — only names are ever
 * exposed, never phone numbers or emails. Read receipts, user reporting and
 * admin review keep threads safe.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Resolve the two user ids entitled to a booking thread. */
  private async bookingParties(bookingId: string): Promise<{ customerId: string; providerUserId: string }> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    const profile = await (this.prisma as any).providerProfile?.findUnique?.({
      where: { id: booking.providerId },
      select: { userId: true },
    });
    if (!profile?.userId) throw new NotFoundException('Provider not found for booking');
    return { customerId: booking.customerId, providerUserId: profile.userId as string };
  }

  private async requireParticipant(actor: MessageActor, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (!conv.participantIds.includes(actor.sub)) {
      throw new ForbiddenException('Not a participant of this conversation');
    }
    return conv;
  }

  /** Open (or return) the single thread for a booking. Both sides allowed. */
  async openThread(actor: MessageActor, bookingId: string) {
    const { customerId, providerUserId } = await this.bookingParties(bookingId);
    if (actor.sub !== customerId && actor.sub !== providerUserId) {
      throw new ForbiddenException('Only the booking customer or provider can message here');
    }
    let conv = await this.prisma.conversation.findFirst({ where: { bookingId } });
    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: { bookingId, participantIds: [customerId, providerUserId] },
      });
      await this.audit.record({
        actorId: actor.sub, action: 'conversation.open', entity: 'conversation', entityId: conv.id,
        after: { bookingId },
      });
    }
    return this.mapConversation(conv);
  }

  async listMine(actor: MessageActor) {
    const convs = await this.prisma.conversation.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const mine = convs.filter((c) => c.participantIds.includes(actor.sub));
    return Promise.all(mine.map((c) => this.withPreview(c, actor.sub)));
  }

  async getMessages(actor: MessageActor, conversationId: string, query: MessagesQuery) {
    await this.requireParticipant(actor, conversationId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);
    const data = await this.withNames(rows);
    return { data, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 } };
  }

  async send(actor: MessageActor, conversationId: string, body: string) {
    const conv = await this.requireParticipant(actor, conversationId);
    const clean = body.trim();
    if (!clean) throw new BadRequestException('Message body is required');
    const msg = await this.prisma.message.create({
      data: { conversationId: conv.id, senderId: actor.sub, body: clean.slice(0, 2000), read: false },
    });
    const [mapped] = await this.withNames([msg]);
    return mapped;
  }

  /** Only the recipient marks a message read (sender's own messages stay as-is). */
  async markRead(actor: MessageActor, messageId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.requireParticipant(actor, msg.conversationId);
    if (msg.senderId === actor.sub) {
      throw new BadRequestException('Cannot mark your own message as read');
    }
    await this.prisma.message.update({ where: { id: messageId }, data: { read: true } });
    return { id: messageId, read: true };
  }

  async report(actor: MessageActor, conversationId: string, reason: string) {
    const conv = await this.requireParticipant(actor, conversationId);
    const report = await (this.prisma as any).conversationReport.create({
      data: { conversationId: conv.id, reporterId: actor.sub, reason, status: 'OPEN' },
    });
    await this.audit.record({
      actorId: actor.sub, action: 'conversation.report', entity: 'conversationReport', entityId: report.id,
      after: { conversationId: conv.id },
    });
    return { id: report.id, status: report.status };
  }

  // --- admin --------------------------------------------------------------------------

  private assertAdmin(actor: MessageActor) {
    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actor.role)) {
      throw new ForbiddenException('Only admins can intervene in conversations');
    }
  }

  async adminGetMessages(actor: MessageActor, conversationId: string, query: MessagesQuery) {
    this.assertAdmin(actor);
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    return this.getMessages({ sub: conv.participantIds[0], role: actor.role }, conversationId, query);
  }

  async listReports(actor: MessageActor, query: { status?: string; page?: number; pageSize?: number }) {
    this.assertAdmin(actor);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: any = {};
    if (query.status) where.status = query.status;
    const [rows, total] = await Promise.all([
      (this.prisma as any).conversationReport.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      }),
      (this.prisma as any).conversationReport.count({ where }),
    ]);
    return { data: rows, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 } };
  }

  async reviewReport(actor: MessageActor, id: string, input: ReviewReportInput) {
    this.assertAdmin(actor);
    const existing = await (this.prisma as any).conversationReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Report not found');
    const updated = await (this.prisma as any).conversationReport.update({
      where: { id },
      data: { status: input.status },
    });
    await this.audit.record({
      actorId: actor.sub, action: 'conversationReport.review', entity: 'conversationReport', entityId: id,
      before: { status: existing.status }, after: { status: input.status, note: input.note ?? null },
    });
    return updated;
  }

  // --- helpers ----------------------------------------------------------------------------

  private mapConversation(c: any) {
    return { id: c.id, bookingId: c.bookingId, createdAt: c.createdAt };
  }

  private async withPreview(c: any, viewerId: string) {
    const [latest, unread] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: c.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
      }),
      this.prisma.message.count({
        where: { conversationId: c.id, read: false, senderId: { not: viewerId } },
      }),
    ]);
    const mapped = latest.length ? (await this.withNames(latest))[0] : null;
    return { ...this.mapConversation(c), latestMessage: mapped, unreadCount: unread };
  }

  /** Attach display names only — never emails, phones, or other contact details. */
  private async withNames(rows: any[]) {
    const ids = [...new Set(rows.map((m) => m.senderId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      senderName: names.get(m.senderId) ?? 'Member',
      body: m.body,
      read: m.read,
      createdAt: m.createdAt,
    }));
  }
}
