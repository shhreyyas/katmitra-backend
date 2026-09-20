-- CreateTable
CREATE TABLE "BusinessOwner" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessOwner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessOwner_businessId_idx" ON "BusinessOwner"("businessId");

-- AddForeignKey
ALTER TABLE "BusinessOwner" ADD CONSTRAINT "BusinessOwner_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one primary BusinessOwner row per existing Business that has an owner name set.
INSERT INTO "BusinessOwner" ("id", "businessId", "name", "phone", "isPrimary", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", "ownerName", "contactNumber", true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Business"
WHERE "ownerName" IS NOT NULL AND btrim("ownerName") <> '';
