import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProposeActionInput, ReviewProposalInput } from './dto/ai.schema';

/**
 * Actions the AI layer must NEVER perform autonomously — money movement,
 * user punishment, account deletion, commission or ledger changes.
 */
export const SENSITIVE_KINDS = new Set([
  'MONEY_TRANSFER',
  'PAYOUT_INITIATE',
  'REFUND_ISSUE',
  'USER_SUSPEND',
  'ACCOUNT_DELETE',
  'COMMISSION_CHANGE',
  'LEDGER_ADJUST',
]);

/**
 * The ONLY kind the gate will execute, and only after human approval:
 * flagging something for human review (reversible, non-destructive).
 * Everything else — even APPROVED — is REFUSED: dangerous actions execute
 * exclusively through existing admin endpoints operated by a human.
 */
const EXECUTABLE_KINDS = new Set(['FLAG_FOR_REVIEW']);

const KIND_RE = /^[A-Z_]{3,40}$/;

/**
 * Deterministic human-confirmation gate. Flow: PROPOSED → APPROVED/REJECTED
 * (admin) → EXECUTED (safe kinds) or REFUSED (sensitive kinds, always).
 * Every transition is audit-logged. AI code paths can propose; they can
 * never approve or execute.
 */
@Injectable()
export class AIActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async propose(proposedBy: string | null, input: ProposeActionInput) {
    const kind = input.kind.trim().toUpperCase();
    if (!KIND_RE.test(kind)) {
      throw new BadRequestException('Action kind must be 3–40 chars of A–Z_.');
    }
    const raw = JSON.stringify(input.payload ?? {});
    if (raw.length > 10_000) throw new BadRequestException('Action payload too large (max 10KB)');
    const proposal = await this.prisma.aiActionProposal.create({
      data: {
        proposedBy,
        kind,
        payload: (input.payload ?? {}) as any,
        reason: input.reason ?? null,
        status: 'PROPOSED',
      },
    });
    await this.audit.record({
      actorId: proposedBy,
      action: 'aiAction.propose',
      entity: 'aiActionProposal',
      entityId: proposal.id,
      after: { kind, sensitive: SENSITIVE_KINDS.has(kind) },
    });
    return this.mapProposal(proposal);
  }

  async list(status?: string) {
    const rows = await this.prisma.aiActionProposal.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.mapProposal(r));
  }

  async review(adminId: string, role: string, id: string, input: ReviewProposalInput) {
    this.assertAdmin(role);
    const existing = await this.prisma.aiActionProposal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proposal not found');
    if (existing.status !== 'PROPOSED') {
      throw new BadRequestException(`Proposal is already ${existing.status}`);
    }
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.aiActionProposal.update({
      where: { id },
      data: { status, reviewedBy: adminId, reviewedAt: new Date() },
    });
    await this.audit.record({
      actorId: adminId,
      action: 'aiAction.review',
      entity: 'aiActionProposal',
      entityId: id,
      before: { status: 'PROPOSED' },
      after: { status, note: input.note ?? null },
    });
    return this.mapProposal(updated);
  }

  async execute(adminId: string, role: string, id: string) {
    this.assertAdmin(role);
    const existing = await this.prisma.aiActionProposal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proposal not found');
    if (existing.status !== 'APPROVED') {
      throw new BadRequestException('Only APPROVED proposals can execute');
    }
    if (!EXECUTABLE_KINDS.has(existing.kind)) {
      const refused = await this.prisma.aiActionProposal.update({
        where: { id },
        data: { status: 'REFUSED' },
      });
      await this.audit.record({
        actorId: adminId,
        action: 'aiAction.refuse',
        entity: 'aiActionProposal',
        entityId: id,
        before: { status: 'APPROVED' },
        after: { status: 'REFUSED', kind: existing.kind },
      });
      return {
        ...this.mapProposal(refused),
        note: 'Refused: AI-context execution is limited to review flags. A human operator must perform this action via the admin console.',
      };
    }

    // FLAG_FOR_REVIEW: reversible, non-destructive.
    const payload = (existing.payload ?? {}) as Record<string, any>;
    if (!payload.entityType || !payload.entityId) {
      throw new BadRequestException('FLAG_FOR_REVIEW requires entityType and entityId');
    }
    const alert = await this.prisma.fraudAlert.create({
      data: {
        entityType: String(payload.entityType).slice(0, 80),
        entityId: String(payload.entityId).slice(0, 120),
        score: Math.min(100, Math.max(0, Number(payload.score ?? 50) || 50)),
        reason: String(payload.reason ?? existing.reason ?? 'AI review flag').slice(0, 500),
        status: 'OPEN',
      },
    });
    const executed = await this.prisma.aiActionProposal.update({
      where: { id },
      data: { status: 'EXECUTED' },
    });
    await this.audit.record({
      actorId: adminId,
      action: 'aiAction.execute',
      entity: 'aiActionProposal',
      entityId: id,
      after: { status: 'EXECUTED', alertId: alert.id },
    });
    return { ...this.mapProposal(executed), alertId: alert.id };
  }

  private assertAdmin(role: string) {
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can review AI action proposals');
    }
  }

  private mapProposal(p: any) {
    return {
      id: p.id,
      kind: p.kind,
      payload: p.payload,
      reason: p.reason,
      status: p.status,
      sensitive: SENSITIVE_KINDS.has(p.kind),
      proposedBy: p.proposedBy,
      reviewedBy: p.reviewedBy,
      reviewedAt: p.reviewedAt,
      createdAt: p.createdAt,
    };
  }
}
