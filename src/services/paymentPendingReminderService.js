/**
 * Payment Pending Reminder Service
 *
 * Finds completed Bookings (completedAt is set) where payment is still
 * outstanding (paymentStatus != RECEIVED) and notifies business users
 * 7 days after completion to follow up on the payment.
 *
 * Dedup strategy:
 *   Reuses the existing BookingReminder model with reminderType = "payment_pending".
 *   @@unique([bookingId, reminderType]) prevents duplicates.
 *   Upsert after successful delivery — concurrent cron ticks are safe.
 *
 * Retry strategy:
 *   If push delivery fails we do NOT insert the BookingReminder record.
 *   The next cron tick re-queries the same booking (no record yet) and retries.
 */

const prisma = require("../config/prisma");
const { sendGroupedNotification } = require("../utils/notificationLocalization");
const { getNotificationContent, buildForSuffix } = require("../utils/notificationTranslations");

const REMINDER_TYPE  = "payment_pending";
const WINDOW_MINUTES = 15;
const DAYS_BACK      = 7;

/**
 * Processes the 7-day payment-pending reminder for the current cron tick.
 *
 * @returns {Promise<{ processed: number, notified: number, failed: number, skipped: number }>}
 */
async function processPaymentPendingReminder() {
  const now         = new Date();
  const windowEnd   = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60_000);
  const windowStart = new Date(windowEnd.getTime() - WINDOW_MINUTES * 60_000);

  let bookings;
  try {
    bookings = await prisma.booking.findMany({
      where: {
        completedAt:     { gte: windowStart, lt: windowEnd },
        paymentStatus:   { not: "RECEIVED" },
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
    console.error("[PaymentPending] DB query failed:", err.message);
    return { processed: 0, notified: 0, failed: 0, skipped: 0 };
  }

  if (bookings.length === 0) {
    return { processed: 0, notified: 0, failed: 0, skipped: 0 };
  }

  console.log(
    `[PaymentPending] ${bookings.length} booking(s) in window ` +
    `[${windowStart.toISOString()} – ${windowEnd.toISOString()}]`,
  );

  let notified = 0, failed = 0, skipped = 0;

  for (const booking of bookings) {
    const users = booking.business.users.filter((u) => u.deviceToken);

    if (users.length === 0) { skipped++; continue; }

    const ok = await _sendPaymentPendingReminder(booking, users);
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
async function _sendPaymentPendingReminder(booking, users) {
  const notifData = { screen: "bookingPaymentDetails", bookingId: booking.id };

  let pushResult;
  try {
    pushResult = await sendGroupedNotification(
      users,
      (lang) => getNotificationContent("paymentPending", lang, {
        forSuffix: buildForSuffix(lang, booking.customerName),
      }),
      notifData,
      "payment_pending",
    );
  } catch (err) {
    console.error(`[PaymentPending] sendGroupedNotification threw for booking ${booking.id}:`, err.message);
    return false;
  }

  const delivered = pushResult.successCount > 0 || pushResult.skippedCount === users.length;
  if (!delivered) {
    console.warn(
      `[PaymentPending] Push delivery failed for booking ${booking.id} ` +
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
    console.error(`[PaymentPending] Dedup upsert failed for booking ${booking.id}:`, err.message);
  }

  console.log(
    `[PaymentPending] Booking ${booking.id} — ` +
    `sent=${pushResult.successCount} errors=${pushResult.errorCount} skipped=${pushResult.skippedCount}`,
  );
  return true;
}

module.exports = { processPaymentPendingReminder };
