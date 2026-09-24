-- Phase 16 — auditable fraud-review workflow on alerts.
ALTER TABLE "FraudAlert" ADD COLUMN "checkKey" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "FraudAlert" ADD COLUMN "evidence" JSONB;
ALTER TABLE "FraudAlert" ADD COLUMN "recommendedAction" TEXT;
ALTER TABLE "FraudAlert" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "FraudAlert" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "FraudAlert" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "FraudAlert_status_createdAt_idx" ON "FraudAlert"("status", "createdAt");
CREATE INDEX "FraudAlert_checkKey_entityType_entityId_status_idx"
  ON "FraudAlert"("checkKey", "entityType", "entityId", "status");
