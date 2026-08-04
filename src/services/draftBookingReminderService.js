/**
 * Draft Booking Reminder Service
 *
 * Two reminders for Bookings in DRAFT status that have an eventAt date set:
 *   1. draft_expiring_3d — fires 3 days before eventAt
 *   2. draft_expired_1d  — fires 1 day after eventAt has passed
 *
 * Dedup: reuses existing BookingReminder model with new reminderType strings.
 * Retry: failed push → no dedup record → retried next 15-min tick.
 */

const prisma = require("../config/prisma");
const { sendGroupedNotification } = require("../utils/notificationLocalization");
const { getNotificationContent, buildForSuffix } = require("../utils/notificationTranslations");

const WINDOW_MINUTES = 15;
const DAYS_BEFORE    = 3;
const DAYS_AFTER     = 1;

const USER_FILTER = {
  notificationStatus: 1,
  deviceToken:        { not: null },
  deletedAt:          null,
};

function _buildWindow(offsetMs) {
  const now         = new Date();
  const windowEnd   = new Date(now.getTime() + offsetMs);
  const windowStart = new Date(windowEnd.getTime() - WINDOW_MINUTES * 60_000);
  return { windowStart, windowEnd };
}

async function _fetchDraftBookings(windowStart, windowEnd, reminderType) {
  return prisma.booking.findMany({
    where: {
      eventAt:          { gte: windowStart, lt: windowEnd },
      status:           "DRAFT",
      bookingReminders: { none: { reminderType } },
      business:         { users: { some: USER_FILTER } },
    },
    select: {
      id:           true,
      customerName: true,
      business: {
        select: {
          users: {
            where:  USER_FILTER,
            select: { id: true, deviceToken: true, language: true },
          },
        },
      },
    },
  });
}

async function _notify(booking, users, messageId, params, type, reminderType) {
  const notifData = { screen: "bookingDetails", bookingId: booking.id };

  let pushResult;
  try {
    pushResult = await sendGroupedNotification(
      users,
      (lang) => getNotificationContent(messageId, lang, { forSuffix: buildForSuffix(lang, params.customerName) }),
      notifData,
      type,
    );
  } catch (err) {
    console.error(`[DraftReminder:${reminderType}] sendGroupedNotification threw for ${booking.id}:`, err.message);
    return false;
  }

  const delivered = pushResult.successCount > 0 || pushResult.skippedCount === users.length;
  if (!delivered) {
    console.warn(`[DraftReminder:${reminderType}] Delivery failed for ${booking.id} — will retry`);
    return false;
  }

  try {
    await prisma.bookingReminder.upsert({
      where:  { bookingId_reminderType: { bookingId: booking.id, reminderType } },
      create: { bookingId: booking.id, reminderType },
      update: {},
    });
  } catch (err) {
    console.error(`[DraftReminder:${reminderType}] Dedup upsert failed for ${booking.id}:`, err.message);
  }

  console.log(
    `[DraftReminder:${reminderType}] Booking ${booking.id} — ` +
    `sent=${pushResult.successCount} errors=${pushResult.errorCount}`,
  );
  return true;
}

async function _runReminder(windowStart, windowEnd, reminderType, messageId, notifType) {
  let bookings;
  try {
    bookings = await _fetchDraftBookings(windowStart, windowEnd, reminderType);
  } catch (err) {
    console.error(`[DraftReminder:${reminderType}] DB query failed:`, err.message);
    return { processed: 0, notified: 0, failed: 0, skipped: 0 };
  }

  if (bookings.length === 0) return { processed: 0, notified: 0, failed: 0, skipped: 0 };

  console.log(`[DraftReminder:${reminderType}] ${bookings.length} booking(s) in window`);

  let notified = 0, failed = 0, skipped = 0;

  for (const b of bookings) {
    const users = b.business.users.filter((u) => u.deviceToken);

    if (users.length === 0) { skipped++; continue; }

    const ok = await _notify(b, users, messageId, { customerName: b.customerName }, notifType, reminderType);
    if (ok) notified++;
    else    failed++;
  }

  return { processed: bookings.length, notified, failed, skipped };
}

/**
 * Fires 3 days before eventAt for DRAFT bookings.
 */
async function processDraftBookingExpiringReminder() {
  const { windowStart, windowEnd } = _buildWindow(DAYS_BEFORE * 24 * 60 * 60_000);
  return _runReminder(windowStart, windowEnd, "draft_expiring_3d", "draftUpcoming", "draft_expiring");
}

/**
 * Fires 1 day after eventAt has passed for DRAFT bookings.
 */
async function processDraftBookingExpiredReminder() {
  const { windowStart, windowEnd } = _buildWindow(-DAYS_AFTER * 24 * 60 * 60_000);
  return _runReminder(windowStart, windowEnd, "draft_expired_1d", "draftPassed", "draft_expired");
}

module.exports = { processDraftBookingExpiringReminder, processDraftBookingExpiredReminder };
