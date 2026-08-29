/*
  Warnings:

  - Added the required column `deliveryTypes` to the `ProviderService` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `ProviderService` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ProviderService` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'SUSPENDED');

-- DropForeignKey
ALTER TABLE "ProviderService" DROP CONSTRAINT "ProviderService_serviceId_fkey";

-- DropIndex
DROP INDEX "ProviderService_providerId_serviceId_key";

-- AlterTable
ALTER TABLE "ProviderDocument" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "verificationId" TEXT;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "address" JSONB,
ADD COLUMN     "businessPhone" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "languages" TEXT[],
ADD COLUMN     "socialLinks" JSONB,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "websiteUrl" TEXT,
ADD COLUMN     "workingPreferences" JSONB,
ADD COLUMN     "yearsExperience" INTEGER;

-- AlterTable
ALTER TABLE "ProviderService" ADD COLUMN     "bookingWindowDays" INTEGER,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deliveryTypes" JSONB NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "durationMin" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "images" JSONB,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "travelFeeCents" BIGINT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "serviceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProviderVerification" ADD COLUMN     "reSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "reviewerNotes" TEXT,
ADD COLUMN     "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProviderCategory" (
    "providerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ProviderCategory_pkey" PRIMARY KEY ("providerId","categoryId")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "images" JSONB,
    "link" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderVerificationHistory" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "fromStatus" "VerificationStatus",
    "toStatus" "VerificationStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderVerificationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioItem_providerId_idx" ON "PortfolioItem"("providerId");

-- CreateIndex
CREATE INDEX "ProviderVerificationHistory_providerId_idx" ON "ProviderVerificationHistory"("providerId");

-- CreateIndex
CREATE INDEX "ProviderVerificationHistory_verificationId_idx" ON "ProviderVerificationHistory"("verificationId");

-- AddForeignKey
ALTER TABLE "ProviderCategory" ADD CONSTRAINT "ProviderCategory_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCategory" ADD CONSTRAINT "ProviderCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderVerificationHistory" ADD CONSTRAINT "ProviderVerificationHistory_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "ProviderVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDocument" ADD CONSTRAINT "ProviderDocument_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "ProviderVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderService" ADD CONSTRAINT "ProviderService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderService" ADD CONSTRAINT "ProviderService_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
