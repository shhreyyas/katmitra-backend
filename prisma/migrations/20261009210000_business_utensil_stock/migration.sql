-- Per-business stock for shared (catalogue) utensils.
-- Catalogue SupplyItem rows are shared by every business, so their stock can no
-- longer live on the row itself. Additive only: no existing table is altered.

CREATE TABLE "BusinessUtensilStock" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "supplyItemId" TEXT NOT NULL,
    "availableCount" INTEGER,
    "damagedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessUtensilStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessUtensilStock_businessId_supplyItemId_key" ON "BusinessUtensilStock"("businessId", "supplyItemId");

CREATE INDEX "BusinessUtensilStock_supplyItemId_idx" ON "BusinessUtensilStock"("supplyItemId");

ALTER TABLE "BusinessUtensilStock" ADD CONSTRAINT "BusinessUtensilStock_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessUtensilStock" ADD CONSTRAINT "BusinessUtensilStock_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
