-- "Make it my own": a business's copy of a global supply item links back to it.
-- Adds one nullable column, its index and foreign key; no existing rows are changed.
ALTER TABLE "SupplyItem" ADD COLUMN "parentSupplyItemId" TEXT;

CREATE INDEX "SupplyItem_parentSupplyItemId_idx" ON "SupplyItem"("parentSupplyItemId");

ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_parentSupplyItemId_fkey" FOREIGN KEY ("parentSupplyItemId") REFERENCES "SupplyItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
