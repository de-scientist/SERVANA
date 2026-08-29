-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelFeeCents" BIGINT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "cancelledByRole" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reference" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "serviceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "BookingStatusHistory" ADD COLUMN     "actorRole" TEXT;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "cancellationPolicy" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- CreateIndex
CREATE INDEX "Booking_providerId_status_idx" ON "Booking"("providerId", "status");

-- CreateIndex
CREATE INDEX "Booking_startsAt_idx" ON "Booking"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_providerId_startsAt_key" ON "Booking"("providerId", "startsAt");
