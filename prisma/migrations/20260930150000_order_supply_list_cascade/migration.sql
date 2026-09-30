-- An order supply list lives and dies with its booking.
ALTER TABLE "SupplySavedList" DROP CONSTRAINT "SupplySavedList_bookingId_fkey";
ALTER TABLE "SupplySavedList" ADD CONSTRAINT "SupplySavedList_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Order lists always mirror their booking now (edits happen on the booking's
-- own supply list), including ones previously frozen by a manual edit.
UPDATE "SupplySavedList" SET "autoSync" = true WHERE "bookingId" IS NOT NULL;
