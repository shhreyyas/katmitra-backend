-- At most one order supply list per booking.
CREATE UNIQUE INDEX "SupplySavedList_businessId_bookingId_key" ON "SupplySavedList"("businessId", "bookingId");
