-- Optional business + global catalog (admin-managed templates).
ALTER TABLE "ExtraService" ALTER COLUMN "businessId" DROP NOT NULL;

ALTER TABLE "ExtraService" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "ExtraService" ADD COLUMN "isGlobal" BOOLEAN NOT NULL DEFAULT false;

-- Existing rows are business-owned caterer catalog entries.
UPDATE "ExtraService" SET "isGlobal" = false WHERE "businessId" IS NOT NULL;

ALTER TABLE "ExtraService" ADD CONSTRAINT "ExtraService_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ExtraService_createdByUserId_idx" ON "ExtraService"("createdByUserId");
CREATE INDEX "ExtraService_isGlobal_idx" ON "ExtraService"("isGlobal");
