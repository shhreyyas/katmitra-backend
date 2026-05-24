-- Idempotent: column may already exist if applied manually on Supabase.
ALTER TABLE "BookingEvent" ADD COLUMN IF NOT EXISTS "jamanvarType" TEXT;
