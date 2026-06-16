-- CreateTable: EventReminder
-- Tracks per-event reminder delivery. The unique constraint on
-- (bookingEventId, reminderType) guarantees exactly-once insertion and
-- allows the cron query to filter already-sent events at the DB level.
CREATE TABLE "EventReminder" (
    "id"             TEXT        NOT NULL,
    "bookingEventId" TEXT        NOT NULL,
    "reminderType"   TEXT        NOT NULL,
    "sentAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);

-- Dedup guard: one reminder type per event
CREATE UNIQUE INDEX "EventReminder_bookingEventId_reminderType_key"
    ON "EventReminder"("bookingEventId", "reminderType");

-- Efficient lookup of reminders for a single event
CREATE INDEX "EventReminder_bookingEventId_idx"
    ON "EventReminder"("bookingEventId");

-- Used when querying reminders by type and time range (analytics / auditing)
CREATE INDEX "EventReminder_reminderType_sentAt_idx"
    ON "EventReminder"("reminderType", "sentAt");

-- EventAt index on BookingEvent speeds the window query used by the cron
CREATE INDEX IF NOT EXISTS "BookingEvent_eventAt_idx"
    ON "BookingEvent"("eventAt");

-- ForeignKey: cascade on event deletion
ALTER TABLE "EventReminder"
    ADD CONSTRAINT "EventReminder_bookingEventId_fkey"
    FOREIGN KEY ("bookingEventId")
    REFERENCES "BookingEvent"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
