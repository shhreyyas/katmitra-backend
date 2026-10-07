-- Admin "force delete" for supply items: a soft-delete marker.
-- Adds one nullable column; no existing rows are changed.
ALTER TABLE "SupplyItem" ADD COLUMN "deletedAt" TIMESTAMP(3);
