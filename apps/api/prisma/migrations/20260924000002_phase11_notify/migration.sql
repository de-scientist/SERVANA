-- Phase 11 — notification delivery tracking + conversation reports.

-- Template event/channel addressing (key format EVENT:CHANNEL).
ALTER TABLE "NotificationTemplate" ADD COLUMN "event" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NotificationTemplate" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "NotificationTemplate_event_active_idx" ON "NotificationTemplate"("event", "active");

-- Delivery status for external channels.
ALTER TABLE "Notification" ADD COLUMN "subject" TEXT;
ALTER TABLE "Notification" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Notification" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Notification" ADD COLUMN "error" TEXT;
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- Message pagination + abuse reports.
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

CREATE TABLE "ConversationReport" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConversationReport_conversationId_idx" ON "ConversationReport"("conversationId");
CREATE INDEX "ConversationReport_status_idx" ON "ConversationReport"("status");
ALTER TABLE "ConversationReport" ADD CONSTRAINT "ConversationReport_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
