-- Phase 13 — AI request logging + human-confirmation proposals.
CREATE TABLE "AiRequestLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costCents" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRequestLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiRequestLog_feature_createdAt_idx" ON "AiRequestLog"("feature", "createdAt");
CREATE INDEX "AiRequestLog_actorId_createdAt_idx" ON "AiRequestLog"("actorId", "createdAt");

CREATE TABLE "AiActionProposal" (
    "id" TEXT NOT NULL,
    "proposedBy" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiActionProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiActionProposal_status_createdAt_idx" ON "AiActionProposal"("status", "createdAt");
