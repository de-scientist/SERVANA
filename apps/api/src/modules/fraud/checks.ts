/**
 * Detector registry — pure functions over plain data. Layers per the spec:
 * RULES (fixed thresholds) + ANOMALY (velocity/burst/rate deviation) +
 * AI classification (annotates, never decides) + HUMAN review (only humans
 * act). Findings are risk SIGNALS: no detector suspends, refunds, or pays.
 */

export interface Finding {
  checkKey: string;
  entityType: string;
  entityId: string;
  /** 0–100. <40 informational (no alert), 40–69 MEDIUM, ≥70 HIGH. */
  score: number;
  reason: string;
  evidence: Record<string, unknown>;
  relatedIds: string[];
  recommendedAction: string;
}

export interface ReviewRow {
  id: string;
  providerId: string;
  customerId: string;
  overall: number;
  title?: string | null;
  body?: string | null;
  createdAt: Date;
}

export interface BookingRow {
  id: string;
  customerId: string;
  providerId: string;
  status: string;
  createdAt: Date;
  startsAt: Date;
}

export interface PaymentRow {
  id: string;
  customerId: string;
  providerId: string | null;
  status: string;
  grossCents: bigint;
  createdAt: Date;
}

export interface RefundRow {
  paymentId: string;
  amountCents: bigint;
  createdAt: Date;
}

export interface ReferralRow {
  id: string;
  codeOwnerId: string;
  referredId: string;
  rewardStatus: string;
  createdAt: Date;
}

export interface PayoutRow {
  id: string;
  providerId: string;
  status: string;
  retryCount: number;
  createdAt: Date;
}

export interface UserRow {
  id: string;
  createdAt: Date;
}

const DAY = 86_400_000;

function inWindow<T extends { createdAt: Date }>(rows: T[], now: number, days: number): T[] {
  return rows.filter((r) => now - r.createdAt.getTime() <= days * DAY);
}

function normalizeBody(r: ReviewRow): string {
  return `${r.title ?? ''} ${r.body ?? ''}`.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// --- 1. fake reviews ---------------------------------------------------------------

/** Burst of high ratings in a short window + duplicate review text. */
export function checkFakeReviews(
  reviews: ReviewRow[],
  providerUserIds: Map<string, string>,
  now: number = Date.now(),
): Finding[] {
  const out: Finding[] = [];
  const recent = inWindow(reviews, now, 7);
  const byProvider = new Map<string, ReviewRow[]>();
  for (const r of recent) {
    const list = byProvider.get(r.providerId) ?? [];
    list.push(r);
    byProvider.set(r.providerId, list);
  }
  for (const [providerId, list] of byProvider) {
    if (list.length >= 4) {
      const fiveStar = list.filter((r) => r.overall === 5).length;
      const ratio = fiveStar / list.length;
      if (ratio >= 0.75) {
        const score = Math.min(85, 55 + list.length * 3 + Math.round(ratio * 10));
        out.push({
          checkKey: 'fake-review-burst',
          entityType: 'provider',
          entityId: providerId,
          score,
          reason: `${list.length} reviews in 7 days, ${Math.round(ratio * 100)}% five-star`,
          evidence: { windowDays: 7, reviewCount: list.length, fiveStarRatio: ratio, reviewIds: list.map((r) => r.id) },
          relatedIds: list.map((r) => r.id),
          recommendedAction: 'Read the flagged reviews; if templated, reject them and warn the provider.',
        });
      }
    }
    // Duplicate text across reviewers for the same provider.
    const seen = new Map<string, string[]>();
    for (const r of list) {
      const norm = normalizeBody(r);
      if (norm.length < 20) continue;
      const ids = seen.get(norm) ?? [];
      ids.push(r.id);
      seen.set(norm, ids);
    }
    for (const [text, ids] of seen) {
      if (ids.length >= 2) {
        out.push({
          checkKey: 'fake-review-duplicate-text',
          entityType: 'provider',
          entityId: providerId,
          score: 70,
          reason: `${ids.length} reviews share near-identical text`,
          evidence: { excerpt: text.slice(0, 160), reviewIds: ids },
          relatedIds: ids,
          recommendedAction: 'Compare the reviews side by side; reject copies and check the accounts.',
        });
      }
    }
  }
  // Self-review: customer account is the provider's own user.
  for (const r of reviews) {
    if (providerUserIds.get(r.providerId) === r.customerId) {
      out.push({
        checkKey: 'fake-review-self',
        entityType: 'review',
        entityId: r.id,
        score: 90,
        reason: 'Reviewer is the provider themselves',
        evidence: { reviewId: r.id, providerId: r.providerId, customerId: r.customerId },
        relatedIds: [r.id, r.providerId],
        recommendedAction: 'Remove the review and warn the provider; repeat offences suspend.',
      });
    }
  }
  return out;
}

// --- 2. referral abuse ------------------------------------------------------------------

/** Reward farming rings and abnormal qualification velocity. */
export function checkReferralAbuse(
  referrals: ReferralRow[],
  now: number = Date.now(),
): Finding[] {
  const out: Finding[] = [];
  const paid = referrals.filter((r) => r.rewardStatus === 'PAID');
  const byOwner = new Map<string, ReferralRow[]>();
  for (const r of paid) {
    const list = byOwner.get(r.codeOwnerId) ?? [];
    list.push(r);
    byOwner.set(r.codeOwnerId, list);
  }
  for (const [owner, list] of byOwner) {
    const week = inWindow(list, now, 7);
    if (week.length >= 5) {
      out.push({
        checkKey: 'referral-velocity',
        entityType: 'user',
        entityId: owner,
        score: Math.min(85, 50 + week.length * 3),
        reason: `${week.length} referral rewards paid in 7 days`,
        evidence: { windowDays: 7, paidCount: week.length, referralIds: week.map((r) => r.id) },
        relatedIds: week.map((r) => r.id),
        recommendedAction: 'Spot-check the referred accounts for shared devices or fake bookings.',
      });
    }
  }
  // Cycles: A refers B, B refers C, … back to A.
  const edge = new Map<string, string>(); // referred -> owner
  for (const r of referrals) edge.set(r.referredId, r.codeOwnerId);
  const visited = new Set<string>();
  for (const start of edge.keys()) {
    if (visited.has(start)) continue;
    const path: string[] = [];
    let cur: string | undefined = start;
    while (cur && edge.has(cur) && !path.includes(cur)) {
      path.push(cur);
      visited.add(cur);
      cur = edge.get(cur);
    }
    if (cur && path.includes(cur) && path.length >= 2) {
      const cycle = path.slice(path.indexOf(cur));
      out.push({
        checkKey: 'referral-cycle',
        entityType: 'user',
        entityId: cycle[0],
        score: 85,
        reason: `Referral ring of ${cycle.length} accounts`,
        evidence: { ring: cycle },
        relatedIds: [...cycle],
        recommendedAction: 'Freeze rewards for the ring pending manual identity checks.',
      });
    }
  }
  return out;
}

// --- 3. suspicious account clusters -----------------------------------------------------------

/** Registration bursts suggest bulk-created accounts. */
export function checkAccountBurst(users: UserRow[], now: number = Date.now()): Finding[] {
  const HOUR = 3_600_000;
  const buckets = new Map<number, string[]>();
  for (const u of users) {
    const bucket = Math.floor(u.createdAt.getTime() / HOUR);
    const list = buckets.get(bucket) ?? [];
    list.push(u.id);
    buckets.set(bucket, list);
  }
  const out: Finding[] = [];
  for (const [bucket, ids] of buckets) {
    if (ids.length >= 10 && now - bucket * HOUR <= 7 * DAY) {
      out.push({
        checkKey: 'account-burst',
        entityType: 'cohort',
        entityId: `hour-${bucket}`,
        score: Math.min(80, 45 + ids.length),
        reason: `${ids.length} accounts registered within one hour`,
        evidence: { hourBucket: new Date(bucket * HOUR).toISOString(), userIds: ids.slice(0, 50) },
        relatedIds: ids.slice(0, 50),
        recommendedAction: 'Sample the accounts for shared phones, referral links or booking overlap.',
      });
    }
  }
  return out;
}

// --- 4. booking manipulation -----------------------------------------------------------------------

/** Cancellation gaming + hyper-frequent customer/provider loops. */
export function checkBookingManipulation(
  bookings: BookingRow[],
  now: number = Date.now(),
): Finding[] {
  const out: Finding[] = [];
  const recent = inWindow(bookings, now, 7);

  const cancelsByCustomer = new Map<string, string[]>();
  for (const b of recent) {
    if (b.status !== 'CANCELLED') continue;
    const list = cancelsByCustomer.get(b.customerId) ?? [];
    list.push(b.id);
    cancelsByCustomer.set(b.customerId, list);
  }
  for (const [customerId, ids] of cancelsByCustomer) {
    if (ids.length >= 5) {
      out.push({
        checkKey: 'booking-cancel-spam',
        entityType: 'user',
        entityId: customerId,
        score: Math.min(80, 45 + ids.length * 2),
        reason: `${ids.length} cancellations in 7 days`,
        evidence: { windowDays: 7, bookingIds: ids },
        relatedIds: ids,
        recommendedAction: 'Check whether slots are being blocked or promotions abused.',
      });
    }
  }

  const pairCounts = new Map<string, { customerId: string; providerId: string; ids: string[] }>();
  for (const b of recent) {
    if (b.status !== 'COMPLETED') continue;
    const key = `${b.customerId}:${b.providerId}`;
    const row = pairCounts.get(key) ?? { customerId: b.customerId, providerId: b.providerId, ids: [] };
    row.ids.push(b.id);
    pairCounts.set(key, row);
  }
  for (const row of pairCounts.values()) {
    if (row.ids.length >= 4) {
      out.push({
        checkKey: 'booking-pair-velocity',
        entityType: 'provider',
        entityId: row.providerId,
        score: Math.min(75, 45 + row.ids.length * 3),
        reason: `${row.ids.length} completions with one customer in 7 days`,
        evidence: { windowDays: 7, customerId: row.customerId, bookingIds: row.ids },
        relatedIds: row.ids,
        recommendedAction: 'Verify the services were real (payments, reviews, messages) before acting.',
      });
    }
  }
  return out;
}

// --- 5. payment anomalies ------------------------------------------------------------------------------

/** Repeated failures per user; refund-rate outliers per provider. */
export function checkPaymentAnomalies(
  payments: PaymentRow[],
  refunds: RefundRow[],
  now: number = Date.now(),
): Finding[] {
  const out: Finding[] = [];
  const failedByUser = new Map<string, string[]>();
  for (const p of inWindow(payments, now, 1)) {
    if (p.status !== 'FAILED') continue;
    const list = failedByUser.get(p.customerId) ?? [];
    list.push(p.id);
    failedByUser.set(p.customerId, list);
  }
  for (const [customerId, ids] of failedByUser) {
    if (ids.length >= 3) {
      out.push({
        checkKey: 'payment-failures',
        entityType: 'user',
        entityId: customerId,
        score: Math.min(80, 45 + ids.length * 5),
        reason: `${ids.length} failed payments in 24 hours`,
        evidence: { windowDays: 1, paymentIds: ids },
        relatedIds: ids,
        recommendedAction: 'Check for card testing; consider temporary payment holds via support.',
      });
    }
  }

  const refundedIds = new Set(refunds.map((r) => r.paymentId));
  const byProvider = new Map<string, { total: number; refunded: number; ids: string[] }>();
  for (const p of payments) {
    if (p.status !== 'SUCCESSFUL' && !refundedIds.has(p.id)) continue;
    if (!p.providerId) continue;
    const row = byProvider.get(p.providerId) ?? { total: 0, refunded: 0, ids: [] };
    row.total += 1;
    if (refundedIds.has(p.id)) {
      row.refunded += 1;
      row.ids.push(p.id);
    }
    byProvider.set(p.providerId, row);
  }
  for (const [providerId, row] of byProvider) {
    if (row.total >= 3 && row.refunded / row.total >= 0.5) {
      out.push({
        checkKey: 'payment-refund-rate',
        entityType: 'provider',
        entityId: providerId,
        score: 70,
        reason: `${row.refunded}/${row.total} payments refunded (${Math.round((row.refunded / row.total) * 100)}%)`,
        evidence: { total: row.total, refunded: row.refunded, paymentIds: row.ids },
        relatedIds: row.ids,
        recommendedAction: 'Review the refunded bookings for quality or collusion issues.',
      });
    }
  }
  return out;
}

// --- 6. customer/provider collusion -----------------------------------------------------------------------

/** Exclusive loops: one customer, one provider, glowing reviews, nothing else. */
export function checkCollusion(
  bookings: BookingRow[],
  reviews: ReviewRow[],
): Finding[] {
  const out: Finding[] = [];
  const completedByCustomer = new Map<string, BookingRow[]>();
  for (const b of bookings) {
    if (b.status !== 'COMPLETED') continue;
    const list = completedByCustomer.get(b.customerId) ?? [];
    list.push(b);
    completedByCustomer.set(b.customerId, list);
  }
  for (const [customerId, list] of completedByCustomer) {
    if (list.length < 3) continue;
    const providers = new Set(list.map((b) => b.providerId));
    if (providers.size !== 1) continue;
    const providerId = [...providers][0];
    const customerReviews = reviews.filter((r) => r.customerId === customerId && r.providerId === providerId);
    if (customerReviews.length >= 2 && customerReviews.every((r) => r.overall === 5)) {
      out.push({
        checkKey: 'collusion-loop',
        entityType: 'provider',
        entityId: providerId,
        score: 80,
        reason: `Exclusive loop: ${list.length} completions + ${customerReviews.length} five-star reviews, one customer`,
        evidence: {
          customerId,
          bookingIds: list.map((b) => b.id),
          reviewIds: customerReviews.map((r) => r.id),
        },
        relatedIds: [...list.map((b) => b.id), ...customerReviews.map((r) => r.id)],
        recommendedAction: 'Verify with messages and payment trails; do not punish on this signal alone.',
      });
    }
  }
  return out;
}

// --- 7. suspicious payouts -----------------------------------------------------------------------------------

/** Retry storms and exhausted retries per provider. */
export function checkPayoutRisk(payouts: PayoutRow[], now: number = Date.now()): Finding[] {
  const out: Finding[] = [];
  const recent = inWindow(payouts, now, 7);
  const failedByProvider = new Map<string, PayoutRow[]>();
  for (const p of recent) {
    if (p.status !== 'FAILED') continue;
    const list = failedByProvider.get(p.providerId) ?? [];
    list.push(p);
    failedByProvider.set(p.providerId, list);
  }
  for (const [providerId, list] of failedByProvider) {
    if (list.length >= 3) {
      out.push({
        checkKey: 'payout-failures',
        entityType: 'provider',
        entityId: providerId,
        score: Math.min(75, 45 + list.length * 5),
        reason: `${list.length} failed payouts in 7 days`,
        evidence: { windowDays: 7, payoutIds: list.map((p) => p.id) },
        relatedIds: list.map((p) => p.id),
        recommendedAction: 'Verify the payout method with the provider before retrying further.',
      });
    }
  }
  for (const p of payouts) {
    if (p.retryCount >= 3 && (p.status === 'FAILED' || p.status === 'PENDING')) {
      out.push({
        checkKey: 'payout-retry-exhausted',
        entityType: 'payout',
        entityId: p.id,
        score: 65,
        reason: `Payout exhausted ${p.retryCount} retries without settling`,
        evidence: { payoutId: p.id, providerId: p.providerId, status: p.status, retryCount: p.retryCount },
        relatedIds: [p.id],
        recommendedAction: 'Investigate the method and PSP response manually; do not auto-retry.',
      });
    }
  }
  return out;
}

export function riskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}
