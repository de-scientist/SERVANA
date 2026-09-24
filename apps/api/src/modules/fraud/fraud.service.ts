import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AIService } from '../ai/ai.service';
import {
  Finding,
  riskLevel,
  checkFakeReviews,
  checkReferralAbuse,
  checkAccountBurst,
  checkBookingManipulation,
  checkPaymentAnomalies,
  checkCollusion,
  checkPayoutRisk,
} from './checks';
import { ScanQuery, ReviewAlertInput } from './dto/fraud.schema';

/**
 * Intelligent risk detection. Pipeline per scan:
 *   ledger queries → detector registry (rules + anomaly) → dedupe →
 *   MEDIUM/HIGH alerts. Optional AI annotation adds analyst context.
 *
 * SAFETY INVARIANT: this service can only create, read and review alerts.
 * It has no suspend/refund/payout/commission capability — punishment happens
 * exclusively through existing admin endpoints operated by a human, and the
 * ACTIONED transition requires a note describing what was done.
 */
@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AIService,
  ) {}

  // --- scanning ------------------------------------------------------------------------

  /**
   * Run all detectors over the trailing window and persist new MEDIUM/HIGH
   * alerts (deduplicated against already-OPEN alerts). Returns the scan
   * summary — LOW findings are reported but never stored.
   */
  async scan(actorId: string, query: ScanQuery) {
    const days = query.days ?? 30;
    const minScore = query.minScore ?? 40;
    const since = new Date(Date.now() - days * 86_400_000);

    const [reviews, bookings, payments, refunds, referrals, payouts, users, profiles] = await Promise.all([
      this.prisma.review.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, providerId: true, customerId: true, overall: true, title: true, body: true, createdAt: true },
        take: 5000,
      }),
      this.prisma.booking.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, customerId: true, providerId: true, status: true, createdAt: true, startsAt: true },
        take: 5000,
      }),
      this.prisma.payment.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, customerId: true, providerId: true, status: true, grossCents: true, createdAt: true },
        take: 5000,
      }),
      this.prisma.refund.findMany({
        where: { createdAt: { gte: since } },
        select: { paymentId: true, amountCents: true, createdAt: true },
        take: 5000,
      }),
      this.prisma.referral.findMany({
        select: { id: true, codeId: true, referredId: true, rewardStatus: true, createdAt: true },
        take: 5000,
      }),
      this.prisma.payout.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, providerId: true, status: true, retryCount: true, createdAt: true },
        take: 5000,
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, createdAt: true },
        take: 5000,
      }),
      this.prisma.providerProfile.findMany({ select: { id: true, userId: true }, take: 5000 }),
    ]);

    const codes = await this.prisma.referralCode.findMany({ select: { id: true, customerId: true } });
    const ownerOf = new Map(codes.map((c) => [c.id, c.customerId]));
    const referralsWithOwners = referrals.map((r) => ({
      ...r,
      createdAt: (r as any).createdAt ?? new Date(0),
      codeOwnerId: ownerOf.get(r.codeId) ?? 'unknown',
    }));

    const now = Date.now();
    const providerUserIds = new Map(profiles.map((p) => [p.id, p.userId]));
    const findings: Finding[] = [
      ...checkFakeReviews(reviews as any, providerUserIds, now),
      ...checkReferralAbuse(referralsWithOwners as any, now),
      ...checkAccountBurst(users, now),
      ...checkBookingManipulation(bookings as any, now),
      ...checkPaymentAnomalies(payments as any, refunds as any, now),
      ...checkCollusion(bookings as any, reviews as any),
      ...checkPayoutRisk(payouts as any, now),
    ];

    let scoped = findings;
    if (query.entityType && query.entityId) {
      scoped = findings.filter((f) => f.entityType === query.entityType && f.entityId === query.entityId);
    }
    const eligible = scoped.filter((f) => f.score >= Math.max(minScore, 40));

    // Dedupe: one OPEN alert per (check, entity).
    const open = await this.prisma.fraudAlert.findMany({
      where: { status: 'OPEN' },
      select: { checkKey: true, entityType: true, entityId: true },
      take: 5000,
    });
    const openKeys = new Set(open.map((a) => `${a.checkKey}|${a.entityType}|${a.entityId}`));

    let created = 0;
    let skipped = 0;
    const low = scoped.filter((f) => f.score < 40).length;
    for (const f of eligible) {
      const key = `${f.checkKey}|${f.entityType}|${f.entityId}`;
      if (openKeys.has(key)) {
        skipped += 1;
        continue;
      }
      await this.prisma.fraudAlert.create({
        data: {
          checkKey: f.checkKey,
          entityType: f.entityType,
          entityId: f.entityId,
          score: f.score,
          reason: f.reason,
          evidence: f.evidence as any,
          recommendedAction: f.recommendedAction,
          status: 'OPEN',
        },
      });
      openKeys.add(key);
      created += 1;
    }

    await this.audit.record({
      actorId, action: 'fraud.scan', entity: 'fraudScan', entityId: `${days}d`,
      after: { findings: findings.length, created, skipped, informational: low },
    });

    return {
      windowDays: days,
      findings: findings.length,
      created,
      skippedDuplicates: skipped,
      informational: low,
      byLevel: {
        HIGH: findings.filter((f) => f.score >= 70).length,
        MEDIUM: findings.filter((f) => f.score >= 40 && f.score < 70).length,
        LOW: low,
      },
    };
  }

  // --- AI annotation (classification assist, never a verdict) ------------------------------------

  /**
   * Ask the model for a one-paragraph analyst note on an alert. Stored under
   * evidence.aiNote with provider/model attribution. Failure degrades to no
   * note — the rule finding stands on its own.
   */
  async annotate(adminId: string, id: string) {
    const alert = await this.prisma.fraudAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    try {
      const res = await this.ai.complete({
        actorId: adminId,
        feature: 'fraud-annotation',
        system:
          'You assist human fraud analysts. Summarize the risk signal in 2-3 sentences for a reviewer. ' +
          'Never recommend automatic punishment; always recommend human verification first. No personal data in output.',
        input: `Alert ${alert.checkKey} score ${alert.score}: ${alert.reason}`,
        context: { evidence: alert.evidence ?? null },
        maxTokens: 250,
      });
      const evidence = { ...((alert.evidence ?? {}) as Record<string, unknown>), aiNote: res.text.trim().slice(0, 1000), aiModel: res.model };
      const updated = await this.prisma.fraudAlert.update({
        where: { id },
        data: { evidence: evidence as any },
      });
      await this.audit.record({
        actorId: adminId, action: 'fraud.annotate', entity: 'fraudAlert', entityId: id,
        after: { model: res.model },
      });
      return this.mapAlert(updated);
    } catch (err) {
      this.logger.warn(`AI annotation failed for ${id}: ${(err as Error).message}`);
      return { ...this.mapAlert(alert), aiNote: null as string | null, note: 'Annotation unavailable; rule finding stands.' };
    }
  }

  // --- human review (the only path to action) ----------------------------------------------------------

  async list(query: { status?: string; minScore?: number; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: any = {};
    if (query.status) where.status = query.status as any;
    if (query.minScore != null) where.score = { gte: query.minScore };
    const [rows, total] = await Promise.all([
      this.prisma.fraudAlert.findMany({
        where, orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.fraudAlert.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.mapAlert(r)),
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 0 },
    };
  }

  async get(id: string) {
    const alert = await this.prisma.fraudAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    return this.mapAlert(alert);
  }

  /**
   * Human decision. ACTIONED requires a note describing the action the human
   * took through normal admin endpoints (suspend, refund, warn…). This module
   * performs no punishment itself — enforced by construction (no such imports).
   */
  async review(adminId: string, role: string, id: string, input: ReviewAlertInput) {
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can review fraud alerts');
    }
    const existing = await this.prisma.fraudAlert.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Alert not found');
    if (existing.status !== 'OPEN' && existing.status !== 'REVIEWED') {
      throw new BadRequestException(`Alert is already ${existing.status}`);
    }
    if (input.status === 'ACTIONED' && (!input.note || !input.note.trim())) {
      throw new BadRequestException('ACTIONED requires a note describing the action taken');
    }
    const updated = await this.prisma.fraudAlert.update({
      where: { id },
      data: { status: input.status as any, reviewedBy: adminId, reviewedAt: new Date() },
    });
    await this.audit.record({
      actorId: adminId, action: 'fraud.review', entity: 'fraudAlert', entityId: id,
      before: { status: existing.status },
      after: { status: input.status, note: input.note ?? null },
    });
    return this.mapAlert(updated);
  }

  private mapAlert(a: any) {    return {
      id: a.id,
      checkKey: a.checkKey,
      entityType: a.entityType,
      entityId: a.entityId,
      score: a.score,
      riskLevel: riskLevel(a.score),
      reason: a.reason,
      evidence: a.evidence ?? {},
      recommendedAction: a.recommendedAction ?? null,
      status: a.status,
      reviewedBy: a.reviewedBy ?? null,
      reviewedAt: a.reviewedAt ?? null,
      createdAt: a.createdAt ?? null,
    };
  }
}
