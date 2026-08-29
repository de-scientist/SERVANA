import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import { UpdateAvailabilityInput } from './dto/availability.schema';

const STEP_MIN = 15;
const MIN_LEAD_MINUTES = 30;

export interface DaySlots {
  date: string;
  slots: string[];
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
  ) {}

  async setAvailability(
    providerId: string,
    input: UpdateAvailabilityInput,
  ): Promise<{ rules: number; exceptions: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.availabilityRule.deleteMany({ where: { providerId } });
      await tx.availabilityException.deleteMany({ where: { providerId } });

      if (input.rules.length > 0) {
        await tx.availabilityRule.createMany({
          data: input.rules.map((r) => ({
            providerId,
            dayOfWeek: r.dayOfWeek,
            startMin: r.startMin,
            endMin: r.endMin,
            breakStart: r.breakStart ?? null,
            breakEnd: r.breakEnd ?? null,
          })),
        });
      }
      if (input.exceptions.length > 0) {
        await tx.availabilityException.createMany({
          data: input.exceptions.map((e) => ({
            providerId,
            date: new Date(e.date),
            type: e.type as Prisma.AvailabilityExceptionCreateManyProviderInput['type'],
            note: e.note ?? null,
          })),
        });
      }
      return { rules: input.rules.length, exceptions: input.exceptions.length };
    });
  }

  async getAvailability(providerId: string) {
    const [rules, exceptions] = await Promise.all([
      this.prisma.availabilityRule.findMany({
        where: { providerId },
        orderBy: { dayOfWeek: 'asc' },
      }),
      this.prisma.availabilityException.findMany({
        where: { providerId },
        orderBy: { date: 'asc' },
      }),
    ]);
    return { rules, exceptions };
  }

  async getPublicSlots(
    slug: string,
    serviceId: string,
    date: string,
    days = 1,
  ): Promise<DaySlots[]> {
    const provider = await this.providers.getPublicProfileBySlug(slug);
    if (!provider) throw new NotFoundException('Provider not found');
    return this.generateSlots(provider.id, serviceId, date, days);
  }

  async generateSlots(
    providerId: string,
    serviceId: string,
    date: string,
    days = 1,
  ): Promise<DaySlots[]> {
    const service = await this.prisma.providerService.findFirst({
      where: { id: serviceId, providerId },
      select: {
        id: true,
        durationMin: true,
        bufferMin: true,
        bookingWindowDays: true,
      },
    });
    if (!service) throw new NotFoundException('Service not found');

    const duration = service.durationMin;
    const buffer = service.bufferMin ?? 0;
    const windowDays = service.bookingWindowDays ?? null;

    const rules = await this.prisma.availabilityRule.findMany({
      where: { providerId },
    });
    const rulesByDay = new Map<number, (typeof rules)[number]>();
    for (const r of rules) rulesByDay.set(r.dayOfWeek, r);

    const startDate = this.parseUtcDate(date);
    const lastDate = new Date(startDate);
    lastDate.setUTCDate(lastDate.getUTCDate() + Math.max(0, days - 1));
    const exceptions = await this.prisma.availabilityException.findMany({
      where: {
        providerId,
        date: { gte: startDate, lte: lastDate },
      },
    });
    const closedDates = new Set<string>();
    for (const ex of exceptions) {
      if (ex.type === 'TIME_OFF' || ex.type === 'HOLIDAY') {
        closedDates.add(this.formatUtcDate(ex.date));
      }
    }

    const result: DaySlots[] = [];
    for (let d = 0; d < days; d++) {
      const cur = new Date(startDate);
      cur.setUTCDate(cur.getUTCDate() + d);
      const dateStr = this.formatUtcDate(cur);
      const dow = cur.getUTCDay();
      if (closedDates.has(dateStr)) {
        result.push({ date: dateStr, slots: [] });
        continue;
      }
      const daySlots = this.slotsForDay(
        cur,
        dow,
        rulesByDay.get(dow),
        duration,
        buffer,
        windowDays,
      );
      result.push({ date: dateStr, slots: daySlots });
    }
    return result;
  }

  private slotsForDay(
    day: Date,
    dow: number,
    rule: { startMin: number; endMin: number; breakStart: number | null; breakEnd: number | null } | undefined,
    duration: number,
    buffer: number,
    windowDays: number | null,
  ): string[] {
    const slots: string[] = [];
    const startOfDay = new Date(day);
    startOfDay.setUTCHours(0, 0, 0, 0);

    if (!rule) return slots;
    if (rule.startMin >= rule.endMin) return slots;

    const breakStart = rule.breakStart ?? -1;
    const breakEnd = rule.breakEnd ?? -1;

    const now = new Date();
    const horizon = windowDays != null ? new Date(now.getTime() + windowDays * 86400000) : null;

    const lastStart = rule.endMin - duration - buffer;
    for (let t = rule.startMin; t <= lastStart; t += STEP_MIN) {
      const slotStart = new Date(startOfDay.getTime() + t * 60000);
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);

      if (slotStart.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60000) {
        continue;
      }
      if (horizon && slotStart.getTime() > horizon.getTime()) {
        continue;
      }
      if (breakStart >= 0 && breakEnd >= 0) {
        const overlapsBreak =
          slotStart.getTime() < breakEnd * 60000 + startOfDay.getTime() &&
          slotEnd.getTime() > breakStart * 60000 + startOfDay.getTime();
        if (overlapsBreak) continue;
      }
      slots.push(slotStart.toISOString());
    }
    return slots;
  }

  private parseUtcDate(s: string): Date {
