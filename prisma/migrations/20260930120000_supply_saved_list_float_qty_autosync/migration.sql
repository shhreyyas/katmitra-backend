-- Saved supply list quantities may be fractional (1.5 kg) and large (15000 g).
ALTER TABLE "SupplySavedListItem" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- Order-linked lists stay in sync with the booking until the caterer edits them.
ALTER TABLE "SupplySavedList" ADD COLUMN "autoSync" BOOLEAN NOT NULL DEFAULT false;

-- Existing order lists that were never edited after auto-save start in sync.
UPDATE "SupplySavedList"
SET "autoSync" = true
WHERE "bookingId" IS NOT NULL
  AND "updatedAt" - "createdAt" < INTERVAL '5 seconds';
