-- AlterTable
ALTER TABLE "SupplySavedList" ADD COLUMN "bookingId" TEXT;

-- CreateIndex
CREATE INDEX "SupplySavedList_bookingId_idx" ON "SupplySavedList"("bookingId");

-- AddForeignKey
ALTER TABLE "SupplySavedList" ADD CONSTRAINT "SupplySavedList_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
