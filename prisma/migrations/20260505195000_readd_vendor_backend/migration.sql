CREATE TABLE IF NOT EXISTS "Vendor" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "whatsappNo" TEXT,
    "categorySlug" TEXT,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- Backward-compatible fix for divergent vendor schemas.
ALTER TABLE "Vendor"
  ADD COLUMN IF NOT EXISTS "whatsappNo" TEXT;

ALTER TABLE "Vendor"
  ADD COLUMN IF NOT EXISTS "categorySlug" TEXT;

CREATE INDEX IF NOT EXISTS "Vendor_businessId_isActive_idx"
  ON "Vendor"("businessId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Vendor_businessId_fkey'
  ) THEN
    ALTER TABLE "Vendor"
      ADD CONSTRAINT "Vendor_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

