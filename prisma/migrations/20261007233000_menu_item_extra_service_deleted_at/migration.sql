-- Admin "force delete" for menu items and extra services: a soft-delete marker.
-- Adds one nullable column to each table; no existing rows are changed.
ALTER TABLE "MenuItem" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ExtraService" ADD COLUMN "deletedAt" TIMESTAMP(3);
