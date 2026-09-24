-- Phase 10 — retention engine: loyalty rules, promotion targeting, redemption ledger.

CREATE TABLE "LoyaltyRule" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LoyaltyRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LoyaltyRule_event_key" ON "LoyaltyRule"("event");

-- Promotion targeting + caps.
ALTER TABLE "Promotion" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Promotion" ADD COLUMN "description" TEXT;
ALTER TABLE "Promotion" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE "Promotion" ADD COLUMN "scopeId" TEXT;
ALTER TABLE "Promotion" ADD COLUMN "minOrderCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Promotion" ADD COLUMN "maxDiscountCents" BIGINT;
ALTER TABLE "Promotion" ADD COLUMN "usageLimit" INTEGER;
ALTER TABLE "Promotion" ADD COLUMN "usedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Promotion" ADD COLUMN "perCustomerLimit" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Promotion" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Redemption ledger: who saved what, on which order.
ALTER TABLE "PromotionRedemption" ADD COLUMN "usedBy" TEXT;
ALTER TABLE "PromotionRedemption" ADD COLUMN "discountCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "PromotionRedemption" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Rewards can be disabled without deleting history.
ALTER TABLE "Reward" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
