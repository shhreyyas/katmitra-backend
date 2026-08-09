-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "defaultServiceChargePct" DECIMAL(5,2) NOT NULL DEFAULT 10,
ADD COLUMN     "defaultTaxPct" DECIMAL(5,2) NOT NULL DEFAULT 5;
