-- DropForeignKey
ALTER TABLE "AvailabilityException" DROP CONSTRAINT "AvailabilityException_providerId_fkey";

-- DropIndex
DROP INDEX "AvailabilityException_providerId_date_idx";

-- AlterTable
ALTER TABLE "AvailabilityException" ADD COLUMN     "note" TEXT;

-- AddForeignKey
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
