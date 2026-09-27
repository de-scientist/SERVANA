import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppLoggerService } from '../../common/logging/logger.service';
import { LoyaltyService } from './loyalty.service';

function referralCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `SVN-${suffix}`;
}

/**
 * Referral tracking with abuse guards:
 * - no self-referral (code owner != claimer)
 * - one claim per user, ever
 * - claimant must be a first-timer (no COMPLETED bookings yet)
 * - reward pays only after the referred user's first booking is both
 *   COMPLETED and successfully paid — never for phantom bookings.
 */
@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly loyalty: LoyaltyService,
    private readonly logger: AppLoggerService,
  ) {}

  async myCode(userId: string) {
    const existing = await this.prisma.referralCode.findFirst({ where: { customerId: userId } });
    if (existing) return { code: existing.code };
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const created = await this.prisma.referralCode.create({
          data: { customerId: userId, code: referralCode() },
        });
        return { code: created.code };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new BadRequestException('Could not generate a referral code, try again');
  }

  async claim(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    const codeRow = await this.prisma.referralCode.findUnique({ where: { code } });
    if (!codeRow) throw new NotFoundException('Referral code not found');
    if (codeRow.customerId === userId) {
      throw new BadRequestException('You cannot use your own referral code');
    }
    const already = await this.prisma.referral.findFirst({ where: { referredId: userId } });
    if (already) throw new BadRequestException('A referral code has already been claimed on this account');
    const priorBooking = await this.prisma.booking.findFirst({
      where: { customerId: userId, status: 'COMPLETED' },
    });
    if (priorBooking) {
      throw new BadRequestException('Referral codes are for first-time customers only');
    }

    const referral = await this.prisma.referral.create({
      data: { codeId: codeRow.id, referredId: userId },
    });
    await this.audit.record({
      actorId: userId, action: 'referral.claim', entity: 'referral', entityId: referral.id,
      after: { code },
    });
    return { id: referral.id, code, rewardStatus: referral.rewardStatus };
  }

  async mine(userId: string) {
    const [code, received] = await Promise.all([
      this.prisma.referralCode.findFirst({ where: { customerId: userId } }),
      this.prisma.referral.findFirst({ where: { referredId: userId } }),
    ]);
    // Referrals carry codeId (no Prisma relation): resolve sent manually.
    const myCodes = await this.prisma.referralCode.findMany({ where: { customerId: userId } });
    const ids = new Set(myCodes.map((c) => c.id));
    const all = await this.prisma.referral.findMany({ orderBy: { id: 'desc' } });
    const sentRows = all.filter((r) => ids.has(r.codeId));
    return {
      code: code?.code ?? null,
      sent: sentRows.map((r) => ({
        id: r.id, referredId: r.referredId, firstBookingId: r.firstBookingId, rewardStatus: r.rewardStatus,
      })),
      received: received
        ? { id: received.id, firstBookingId: received.firstBookingId, rewardStatus: received.rewardStatus }
        : null,
    };
  }

  /**
   * Called when a booking completes. Never throws — retention must not break
   * the booking flow.
   */
  async qualifyOnBookingComplete(bookingId: string): Promise<void> {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: { payment: { select: { status: true } } },
      });
      if (!booking || booking.status !== 'COMPLETED') return;
      if (booking.payment?.status !== 'SUCCESSFUL') return;

      const referral = await this.prisma.referral.findFirst({
        where: { referredId: booking.customerId, rewardStatus: 'PENDING', firstBookingId: null },
      });
      if (!referral) return;

      await this.prisma.referral.update({
        where: { id: referral.id },
        data: { firstBookingId: booking.id, rewardStatus: 'QUALIFIED' },
      });

      const codeRow = await this.prisma.referralCode.findUnique({ where: { id: referral.codeId } });
      if (!codeRow) return;

      const earned: any = await this.loyalty.earn(this.prisma, {
        userId: codeRow.customerId,
        event: 'REFERRAL',
        refType: 'REFERRAL',
        refId: referral.id,
        reason: 'Referral reward — referred customer completed first booking',
      });
      if (earned) {
        await this.prisma.referral.update({ where: { id: referral.id }, data: { rewardStatus: 'PAID' } });
        await this.audit.record({
          actorId: codeRow.customerId, action: 'referral.reward', entity: 'referral', entityId: referral.id,
          after: { bookingId: booking.id },
        });
      }
    } catch (err) {
      this.logger.warn(`Referral qualification failed for booking ${bookingId}: ${(err as Error).message}`);
    }
  }
}
