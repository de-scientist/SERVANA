-- Phase 12 — provider_slug on attribution touches.
ALTER TABLE "Attribution" ADD COLUMN "providerSlug" TEXT;
CREATE INDEX "Attribution_userId_createdAt_idx" ON "Attribution"("userId", "createdAt");
