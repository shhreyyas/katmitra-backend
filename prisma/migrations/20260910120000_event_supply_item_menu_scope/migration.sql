-- Per-(event x menu item) scoping for booking-event ingredient overrides.
-- Existing rows keep menuItemId = NULL (event-level fallback / legacy).

ALTER TABLE "BookingEventSupplyItem" ADD COLUMN "menuItemId" TEXT;

-- Old uniqueness was one row per (event, supply item); now the same supply item
-- can hold a distinct quantity per menu item within an event.
DROP INDEX IF EXISTS "BookingEventSupplyItem_bookingEventId_supplyItemId_key";

CREATE UNIQUE INDEX "BookingEventSupplyItem_bookingEventId_supplyItemId_menuItemId_key"
  ON "BookingEventSupplyItem"("bookingEventId", "supplyItemId", "menuItemId");

CREATE INDEX "BookingEventSupplyItem_bookingEventId_menuItemId_idx"
  ON "BookingEventSupplyItem"("bookingEventId", "menuItemId");
