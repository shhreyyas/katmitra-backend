-- Utensil inventory: track damaged units separately from total stock.
ALTER TABLE "SupplyItem" ADD COLUMN "damagedCount" INTEGER NOT NULL DEFAULT 0;
