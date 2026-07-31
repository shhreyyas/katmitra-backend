-- AlterTable: track conversion of a Quotation into a real Booking once the client approves it
ALTER TABLE "Quotation" ADD COLUMN "convertedBookingId" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "convertedAt" TIMESTAMP(3);

-- CreateTable: mirrors BookingEvent — a quotation can now span multiple sessions
-- (breakfast/lunch/dinner), each with its own date/menu snapshot.
CREATE TABLE "QuotationEvent" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3),
    "eventLocation" TEXT,
    "functionType" TEXT,
    "jamanvarType" TEXT,
    "guestCount" INTEGER,
    "notes" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "dishId" TEXT,
    "parentDishId" TEXT,
    "isTemplate" BOOLEAN,
    "eventTotal" DECIMAL(12,2),
    "eventSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: mirrors BookingExtraServiceLine — services attach per QuotationEvent
CREATE TABLE "QuotationExtraServiceLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "eventId" TEXT,
    "extraServiceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "pricingTypeSnapshot" "ExtraServicePricingType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationExtraServiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_convertedBookingId_key" ON "Quotation"("convertedBookingId");

-- CreateIndex
CREATE INDEX "QuotationEvent_quotationId_idx" ON "QuotationEvent"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationEvent_quotationId_eventAt_idx" ON "QuotationEvent"("quotationId", "eventAt");

-- CreateIndex
CREATE INDEX "QuotationEvent_eventAt_idx" ON "QuotationEvent"("eventAt");

-- CreateIndex
CREATE INDEX "QuotationExtraServiceLine_quotationId_idx" ON "QuotationExtraServiceLine"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationExtraServiceLine_quotationId_eventId_idx" ON "QuotationExtraServiceLine"("quotationId", "eventId");

-- CreateIndex
CREATE INDEX "QuotationExtraServiceLine_extraServiceId_idx" ON "QuotationExtraServiceLine"("extraServiceId");

-- AddForeignKey
ALTER TABLE "QuotationEvent" ADD CONSTRAINT "QuotationEvent_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationExtraServiceLine" ADD CONSTRAINT "QuotationExtraServiceLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationExtraServiceLine" ADD CONSTRAINT "QuotationExtraServiceLine_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "QuotationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationExtraServiceLine" ADD CONSTRAINT "QuotationExtraServiceLine_extraServiceId_fkey" FOREIGN KEY ("extraServiceId") REFERENCES "ExtraService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
