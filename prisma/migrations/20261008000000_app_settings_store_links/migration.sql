-- Store listing links for the marketing site (admin-editable).
-- Adds two text columns with an empty default; no existing data is changed.
ALTER TABLE "AppSettings" ADD COLUMN "androidAppUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppSettings" ADD COLUMN "iosAppUrl" TEXT NOT NULL DEFAULT '';
