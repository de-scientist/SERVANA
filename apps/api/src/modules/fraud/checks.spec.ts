import {
  riskLevel,
  checkFakeReviews,
  checkReferralAbuse,
  checkAccountBurst,
  checkBookingManipulation,
  checkPaymentAnomalies,
  checkCollusion,
  checkPayoutRisk,
} from './checks';

const NOW = new Date('2026-09-24T12:00:00Z').getTime();
const agoH = (h: number) => new Date(NOW - h * 3_600_000);
const agoD = (d: number) => new Date(NOW - d * 86_400_000);

describe('fraud detectors (pure signals)', () => {
  describe('riskLevel', () => {
    it('grades 0–39 LOW, 40–69 MEDIUM, 70+ HIGH', () => {
      expect(riskLevel(0)).toBe('LOW');
      expect(riskLevel(39)).toBe('LOW');
      expect(riskLevel(40)).toBe('MEDIUM');
      expect(riskLevel(69)).toBe('MEDIUM');
      expect(riskLevel(70)).toBe('HIGH');
      expect(riskLevel(100)).toBe('HIGH');
    });
  });

  describe('fake reviews', () => {
    it('flags five-star bursts with evidence', () => {
      const reviews = Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`, providerId: 'p1', customerId: `c${i}`, overall: 5,
        title: `Great ${i}`, body: `Wonderful experience number ${i} here today`, createdAt: agoH(i + 1),
      }));
      const out = checkFakeReviews(reviews, new Map(), NOW);
      const burst = out.find((f) => f.checkKey === 'fake-review-burst')!;
      expect(burst.score).toBeGreaterThanOrEqual(70);
      expect(burst.entityId).toBe('p1');
      expect(burst.relatedIds).toHaveLength(5);
      expect(burst.recommendedAction).toBeTruthy();
    });

    it('ignores mixed, organic-looking ratings', () => {
      const reviews = [5, 4, 3, 5, 4, 2].map((overall, i) => ({
        id: `r${i}`, providerId: 'p1', customerId: `c${i}`, overall,
        title: 'ok', body: `totally different review text number ${i} about service`, createdAt: agoD(i + 1),
      }));
      expect(checkFakeReviews(reviews, new Map(), NOW)).toEqual([]);
    });

    it('catches duplicate review text and self-reviews', () => {
      const dupes = [0, 1].map((i) => ({
        id: `d${i}`, providerId: 'p1', customerId: `cx${i}`, overall: 5,
        title: 'Amazing service indeed', body: 'The stylist was absolutely wonderful and amazing service indeed', createdAt: agoH(2),
      }));
      const dup = checkFakeReviews(dupes, new Map(), NOW);
      expect(dup.some((f) => f.checkKey === 'fake-review-duplicate-text')).toBe(true);

      const self = checkFakeReviews(
        [{ id: 's1', providerId: 'p1', customerId: 'u-prov', overall: 5, createdAt: agoH(1) }],
        new Map([['p1', 'u-prov']]),
        NOW,
      );
      expect(self.find((f) => f.checkKey === 'fake-review-self')?.score).toBe(90);
    });
  });

  describe('referral abuse', () => {
    it('flags reward-farming velocity and rings', () => {
      const burst = Array.from({ length: 6 }, (_, i) => ({
        id: `ref${i}`, codeOwnerId: 'farmer', referredId: `v${i}`, rewardStatus: 'PAID', createdAt: agoH(2),
      }));
      const vel = checkReferralAbuse(burst, NOW);
      expect(vel.some((f) => f.checkKey === 'referral-velocity')).toBe(true);

      const ring = [
        { id: 'r1', codeOwnerId: 'a', referredId: 'b', rewardStatus: 'PENDING', createdAt: agoD(1) },
        { id: 'r2', codeOwnerId: 'b', referredId: 'c', rewardStatus: 'PENDING', createdAt: agoD(1) },
        { id: 'r3', codeOwnerId: 'c', referredId: 'a', rewardStatus: 'PENDING', createdAt: agoD(1) },
      ];
      const cyc = checkReferralAbuse(ring, NOW);
      const cycle = cyc.find((f) => f.checkKey === 'referral-cycle')!;
      expect(cycle.score).toBe(85);
      expect(cycle.relatedIds.sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('account bursts', () => {
    it('flags hourly registration spikes, ignores trickles', () => {
      const burst = Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, createdAt: agoH(5) }));
      const out = checkAccountBurst(burst, NOW);
      expect(out).toHaveLength(1);
      expect(out[0].entityType).toBe('cohort');

      const trickle = Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, createdAt: agoD(i + 1) }));
      expect(checkAccountBurst(trickle, NOW)).toEqual([]);
    });
  });

  describe('booking manipulation', () => {
    it('flags cancellation spam and pair velocity', async () => {
      const cancels = Array.from({ length: 5 }, (_, i) => ({
        id: `b${i}`, customerId: 'spammy', providerId: 'p1', status: 'CANCELLED', createdAt: agoH(3), startsAt: agoD(2),
      }));
      expect(checkBookingManipulation(cancels, NOW).some((f) => f.checkKey === 'booking-cancel-spam')).toBe(true);

      expect(checkBookingManipulation(
        Array.from({ length: 3 }, (_, i) => ({
          id: `c${i}`, customerId: 'x', providerId: 'p1', status: 'CANCELLED', createdAt: agoH(3), startsAt: agoD(2),
        })), NOW,
      )).toEqual([]);

      const loop = Array.from({ length: 4 }, (_, i) => ({
        id: `l${i}`, customerId: 'reg', providerId: 'p9', status: 'COMPLETED', createdAt: agoH(6), startsAt: agoD(3),
      }));
      expect(checkBookingManipulation(loop, NOW).some((f) => f.checkKey === 'booking-pair-velocity')).toBe(true);
    });
  });

  describe('payment anomalies', () => {
    it('flags failure storms and refund-rate outliers', () => {
      const fails = Array.from({ length: 3 }, (_, i) => ({
        id: `p${i}`, customerId: 'tester', providerId: null, status: 'FAILED', grossCents: 1000n, createdAt: agoH(2),
      }));
      expect(checkPaymentAnomalies(fails, [], NOW).some((f) => f.checkKey === 'payment-failures')).toBe(true);

      const pays = [
        { id: 'ok1', customerId: 'a', providerId: 'px', status: 'SUCCESSFUL', grossCents: 1000n, createdAt: agoD(1) },
        { id: 'rf1', customerId: 'b', providerId: 'px', status: 'REFUNDED', grossCents: 1000n, createdAt: agoD(1) },
        { id: 'rf2', customerId: 'c', providerId: 'px', status: 'REFUNDED', grossCents: 1000n, createdAt: agoD(1) },
      ];
      const refunds = [
        { paymentId: 'rf1', amountCents: 1000n, createdAt: agoD(1) },
        { paymentId: 'rf2', amountCents: 1000n, createdAt: agoD(1) },
      ];
      const out = checkPaymentAnomalies(pays, refunds, NOW);
      expect(out.some((f) => f.checkKey === 'payment-refund-rate')).toBe(true);
    });
  });

  describe('collusion', () => {
    it('flags exclusive glowing loops, ignores healthy diversity', () => {
      const bookings = Array.from({ length: 3 }, (_, i) => ({
        id: `b${i}`, customerId: 'solo', providerId: 'px', status: 'COMPLETED', createdAt: agoD(2), startsAt: agoD(3),
      }));
      const reviews = [
        { id: 'r1', providerId: 'px', customerId: 'solo', overall: 5, createdAt: agoD(1) },
        { id: 'r2', providerId: 'px', customerId: 'solo', overall: 5, createdAt: agoD(1) },
      ];
      const out = checkCollusion(bookings, reviews);
      expect(out).toHaveLength(1);
      expect(out[0].score).toBe(80);

      const diverse = [
        ...bookings,
        { id: 'b9', customerId: 'solo', providerId: 'other', status: 'COMPLETED', createdAt: agoD(2), startsAt: agoD(3) },
      ];
      expect(checkCollusion(diverse, reviews)).toEqual([]);
    });
  });

  describe('payout risk', () => {
    it('flags failure clusters and exhausted retries', () => {
      const fails = Array.from({ length: 3 }, (_, i) => ({
        id: `po${i}`, providerId: 'pp', status: 'FAILED', retryCount: i, createdAt: agoH(4),
      }));
      expect(checkPayoutRisk(fails, NOW).some((f) => f.checkKey === 'payout-failures')).toBe(true);

      const stuck = [{ id: 'stuck', providerId: 'pp', status: 'FAILED', retryCount: 3, createdAt: agoD(2) }];
      const out = checkPayoutRisk(stuck, NOW);
      expect(out.some((f) => f.checkKey === 'payout-retry-exhausted')).toBe(true);
    });
  });
});
