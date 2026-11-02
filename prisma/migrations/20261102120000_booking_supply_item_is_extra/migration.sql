-- "All events" supply amounts become extras on top of the events' own amounts.
-- Existing rows stored whole-booking totals, so they start as isExtra = false
-- and are read as max(0, total - events' sum) until
-- scripts/convertBookingSupplyItemsToExtras.js rewrites them.
ALTER TABLE "BookingSupplyItem" ADD COLUMN "isExtra" BOOLEAN NOT NULL DEFAULT false;
