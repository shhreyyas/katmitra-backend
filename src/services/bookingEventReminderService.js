/**
 * Booking "No Events" Reminder Service
 *
 * Finds Bookings created 24 hours ago that still have no BookingEvent records
 * and notifies all eligible business users to add events.
 *
 * Dedup strategy:
 *   BookingReminder has @@unique([bookingId, reminderType]).
 *   The query filters out bookings that already have a record (none: {}).
 *   After successful delivery we upsert — concurrent cron ticks are safe.
 *
 * Retry strategy:
 *   If push delivery fails we do NOT insert the BookingReminder record.
 *   The next cron tick re-queries the same booking (no record yet) and retries.
 */

const prisma = require("../config/prisma");
const { sendGroupedNotification } = require("../utils/notificationLocalization");
const { getNotificationContent, buildForSuffix } = require("../utils/notificationTranslations");

const REMINDER_TYPE  = "no_events";
const WINDOW_MINUTES = 15;
const HOURS_BACK     = 24;

/**
 * Processes the 24-hour no-events reminder for the current cron tick.
 *
 * @returns {Promise<{ processed: number, notified: number, failed: number, skipped: number }>}
 */
async function processBookingNoEventsReminder() {
  const now         = new Date();
  const windowEnd   = new Date(now.getTime() - HOURS_BACK * 60 * 60_000);
  const windowStart = new Date(windowEnd.getTime() - WINDOW_MINUTES * 60_000);

  let bookings;
  try {
    bookings = await prisma.booking.findMany({
      where: {
        createdAt: { gte: windowStart, lt: windowEnd },
        status:    { not: "CANCELLED" },
        events:    { none: {} },
        bookingReminders: { none: { reminderType: REMINDER_TYPE } },
        business: {
          users: {
            some: { notificationStatus: 1, deviceToken: { not: null }, deletedAt: null },
          },
        },
      },
      select: {
        id:           true,
        customerName: true,
        business: {
          select: {
            users: {
              where: { notificationStatus: 1, deviceToken: { not: null }, deletedAt: null },
              select: { id: true, deviceToken: true, language: true },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("[BookingNoEvents] DB query failed:", err.message);
    return { processed: 0, notified: 0, failed: 0, skipped: 0 };
  }

  if (bookings.length === 0) {
    return { processed: 0, notified: 0, failed: 0, skipped: 0 };
  }

  console.log(
    `[BookingNoEvents] ${bookings.length} booking(s) in window ` +
    `[${windowStart.toISOString()} – ${windowEnd.toISOString()}]`,
  );

  let notified = 0, failed = 0, skipped = 0;

  for (const booking of bookings) {
    const users = booking.business.users.filter((u) => u.deviceToken);

    if (users.length === 0) { skipped++; continue; }

    const ok = await _sendBookingNoEventsReminder(booking, users);
    if (ok) notified++;
    else    failed++;
  }

  return { processed: bookings.length, notified, failed, skipped };
}

/**
 * Handles the full notification lifecycle for a single booking:
 *   1. Persist UserNotification inbox records for all eligible users
 *   2. Send push via Expo
 *   3. On success: upsert BookingReminder dedup guard
 *
 * @returns {Promise<boolean>}
 */
async function _sendBookingNoEventsReminder(booking, users) {
  const notifData = { screen: "selectEvent", bookingId: booking.id };

  let pushResult;
  try {
    pushResult = await sendGroupedNotification(
      users,
      (lang) => getNotificationContent("bookingNoEvents", lang, {
        forSuffix: buildForSuffix(lang, booking.customerName),
      }),
      notifData,
      "booking_no_events",
    );
  } catch (err) {
    console.error(`[BookingNoEvents] sendGroupedNotification threw for booking ${booking.id}:`, err.message);
    return false;
  }

  const delivered = pushResult.successCount > 0 || pushResult.skippedCount === users.length;
  if (!delivered) {
    console.warn(
      `[BookingNoEvents] Push delivery failed for booking ${booking.id} ` +
      `(errors=${pushResult.errorCount}) — will retry next tick`,
    );
    return false;
  }

  // Step 3: upsert dedup guard — concurrent cron overlaps are safe.
  try {
    await prisma.bookingReminder.upsert({
      where:  { bookingId_reminderType: { bookingId: booking.id, reminderType: REMINDER_TYPE } },
      create: { bookingId: booking.id, reminderType: REMINDER_TYPE },
      update: {},
    });
  } catch (err) {
    // Non-fatal: push already delivered.
    console.error(`[BookingNoEvents] Dedup upsert failed for booking ${booking.id}:`, err.message);
  }

  console.log(
    `[BookingNoEvents] Booking ${booking.id} — ` +
    `sent=${pushResult.successCount} errors=${pushResult.errorCount} skipped=${pushResult.skippedCount}`,
  );
  return true;
}

module.exports = { processBookingNoEventsReminder };
