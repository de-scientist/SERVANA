import { BookingStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'PROVIDER_REJECTED', 'CANCELLED', 'EXPIRED'],
  AWAITING_PAYMENT: ['PAID', 'CANCELLED', 'EXPIRED'],
  PAID: ['CONFIRMED', 'CANCELLED', 'REFUNDED', 'EXPIRED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  PROVIDER_ACCEPTED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  PROVIDER_REJECTED: [],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'DISPUTED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ['REFUNDED', 'DISPUTED'],
  DISPUTED: ['REFUNDED', 'COMPLETED'],
  REFUNDED: [],
  EXPIRED: [],
};

export const TERMINAL_STATUSES: BookingStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'PROVIDER_REJECTED',
  'REFUNDED',
  'EXPIRED',
  'DISPUTED',
];

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new BadRequestException(`Invalid booking transition: ${from} → ${to}`);
  }
}

export function cancelsBooking(status: BookingStatus): boolean {
  return ['PENDING', 'CONFIRMED', 'PROVIDER_ACCEPTED', 'IN_PROGRESS', 'PAID', 'AWAITING_PAYMENT'].includes(
    status,
  );
}

const CUSTOMER_VIEWS: Record<string, BookingStatus[]> = {
  upcoming: ['PENDING', 'CONFIRMED', 'PROVIDER_ACCEPTED', 'AWAITING_PAYMENT', 'PAID'],
  active: ['IN_PROGRESS'],
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED'],
  all: [],
};

const PROVIDER_VIEWS: Record<string, BookingStatus[]> = {
  pending: ['PENDING'],
  upcoming: ['CONFIRMED', 'PROVIDER_ACCEPTED', 'AWAITING_PAYMENT', 'PAID'],
  active: ['IN_PROGRESS'],
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED'],
  all: [],
};

export function statusesForView(view: string | undefined, role: 'customer' | 'provider'): BookingStatus[] {
  if (!view || view === 'all') return [];
  const map = role === 'customer' ? CUSTOMER_VIEWS : PROVIDER_VIEWS;
  return map[view] ?? [];
}
