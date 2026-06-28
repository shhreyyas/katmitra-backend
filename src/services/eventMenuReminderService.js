/**
 * Event "No Menu" Reminder Service
 *
 * Finds BookingEvents created 24 hours ago that still have no menu/dish selected
 * (dishId === null) and notifies all eligible business users to pick a menu.
 *
 * Dedup strategy:
 *   Reuses the existing EventReminder model with reminderType = "no_menu".
 *   @@unique([bookingEventId, reminderType]) prevents duplicates.
 *   Upsert after successful delivery — concurrent cron ticks are safe.
 *
 * Retry strategy:
 *   If push delivery fails we do NOT insert the EventReminder record.
 *   The next cron tick re-queries the same event (no record yet) and retries.
 */

const prisma = require("../config/prisma");
const { sendPushNotifications } = require("../utils/expoPush");

const REMINDER_TYPE  = "no_menu";
const WINDOW_MINUTES = 15;
const HOURS_BACK     = 24;

/**
 * Processes the 24-hour no-menu reminder for the current cron tick.
 *
 * @returns {Promise<{ processed: number, notified: number, failed: number, skipped: number }>}
 */
async function processEventNoMenuReminder() {
  const now         = new Date();
  const windowEnd   = new Date(now.getTime() - HOURS_BACK * 60 * 60_000);
  const windowStart = new Date(windowEnd.getTime() - WINDOW_MINUTES * 60_000);

  let events;
  try {
    events = await prisma.bookingEvent.findMany({
      where: {
        createdAt:      { gte: windowStart, lt: windowEnd },
        dishId:         null,
        status:         { not: "COMPLETED" },
        booking:        { status: { not: "CANCELLED" } },
        eventReminders: { none: { reminderType: REMINDER_TYPE } },
      },
      select: {
        id:           true,
        functionType: true,
        booking: {
          select: {
            id:           true,
            customerName: true,
            business: {
              select: {
                users: {
                  where: { notificationStatus: 1, deviceToken: { not: null }, deletedAt: null },
                  select: { id: true, deviceToken: true },
                },
              },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("[EventNoMenu] DB query failed:", err.message);
    return { processed: 0, notified: 0, failed: 0, skipped: 0 };
  }

  if (events.length === 0) {
    return { processed: 0, notified: 0, failed: 0, skipped: 0 };
  }

  console.log(
    `[EventNoMenu] ${events.length} event(s) in window ` +
    `[${windowStart.toISOString()} – ${windowEnd.toISOString()}]`,
  );

  let notified = 0, failed = 0, skipped = 0;

  for (const event of events) {
    const users   = event.booking.business.users;
    const tokens  = users.map((u) => u.deviceToken).filter(Boolean);
    const userIds = users.map((u) => u.id);

    if (tokens.length === 0) { skipped++; continue; }

    const ok = await _sendEventNoMenuReminder(event, userIds, tokens);
    if (ok) notified++;
    else    failed++;
  }

  return { processed: events.length, notified, failed, skipped };
}

/**
 * Handles the full notification lifecycle for a single event:
 *   1. Persist UserNotification inbox records for all eligible users
 *   2. Send push via Expo
 *   3. On success: upsert EventReminder dedup guard (reminderType = "no_menu")
 *
 * @returns {Promise<boolean>}
 */
async function _sendEventNoMenuReminder(event, userIds, tokens) {
  const customerPart = event.booking.customerName ? ` for ${event.booking.customerName}` : "";
  const title = "Don't forget the menu! 🍽️";
  const body  = `You created an event${customerPart} but haven't selected a menu yet. Tap to pick a menu now.`;
  const notifData = {
    screen:    "selectMenu",
    bookingId: event.booking.id,
    eventId:   event.id,
  };

  // Step 1: persist inbox records before push.
  try {
    await prisma.userNotification.createMany({
      data: userIds.map((userId) => ({
        userId,
        title,
        body,
        type: "event_no_menu",
        data: notifData,
      })),
    });
  } catch (err) {
    console.error(`[EventNoMenu] Inbox createMany failed for event ${event.id}:`, err.message);
    return false;
  }

  // Step 2: send push.
  let pushResult;
  try {
    pushResult = await sendPushNotifications(tokens, { title, body, data: notifData });
  } catch (err) {
    console.error(`[EventNoMenu] Push failed for event ${event.id}:`, err.message);
    return false;
  }

  const delivered = pushResult.successCount > 0 || pushResult.skippedCount === tokens.length;
  if (!delivered) {
    console.warn(
      `[EventNoMenu] Push delivery failed for event ${event.id} ` +
      `(errors=${pushResult.errorCount}) — will retry next tick`,
    );
    return false;
  }

  // Step 3: upsert EventReminder dedup guard — concurrent cron overlaps are safe.
  try {
    await prisma.eventReminder.upsert({
      where:  { bookingEventId_reminderType: { bookingEventId: event.id, reminderType: REMINDER_TYPE } },
      create: { bookingEventId: event.id, reminderType: REMINDER_TYPE },
      update: {},
    });
  } catch (err) {
    // Non-fatal: push already delivered.
    console.error(`[EventNoMenu] Dedup upsert failed for event ${event.id}:`, err.message);
  }

  console.log(
    `[EventNoMenu] Event ${event.id} — ` +
    `sent=${pushResult.successCount} errors=${pushResult.errorCount} skipped=${pushResult.skippedCount}`,
  );
  return true;
}

module.exports = { processEventNoMenuReminder };
