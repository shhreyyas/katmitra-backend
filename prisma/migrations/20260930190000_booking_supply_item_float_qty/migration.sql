-- Booking-level ingredient quantities may be fractional (1.5 kg).
ALTER TABLE "BookingSupplyItem" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;
