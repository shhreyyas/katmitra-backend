const cron = require("node-cron");
const prisma = require("../config/prisma");
const { sendPushNotifications } = require("../utils/expoPush");

/**
 * Formats a UTC date into a human-readable IST string.
 * Example: "Wednesday, 5 June 2026 at 04:00 PM"
 */
function formatEventDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

/**
 * Finds all BookingEvents starting 48–49 hours from now and sends
 * a reminder notification to each eligible business user.
 *
 * Runs every hour. The 1-hour window ensures each event is notified
 * exactly once without needing a separate "sent" flag.
 */
async function sendEventReminders() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 49 * 60 * 60 * 1000);

  let events;
  try {
    events = await prisma.bookingEvent.findMany({
      where: {
        eventAt: {
          gte: windowStart,
          lt: windowEnd,
        },
        status: { not: "COMPLETED" },
        booking: {
          status: { not: "CANCELLED" },
        },
      },
      select: {
        id: true,
        eventAt: true,
        eventLocation: true,
        functionType: true,
        guestCount: true,
        booking: {
          select: {
            id: true,
            customerName: true,
            business: {
              select: {
                users: {
                  where: {
                    notificationStatus: 1,
                    deviceToken: { not: null },
                    deletedAt: null,
                  },
                  select: {
                    id: true,
                    deviceToken: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("[EventReminder] DB query failed:", err.message);
    return;
  }

  if (events.length === 0) {
    console.log("[EventReminder] No events in 48-49h window.");
    return;
  }

  console.log(`[EventReminder] Found ${events.length} event(s) to notify.`);

  for (const event of events) {
    const tokens = event.booking.business.users
      .map((u) => u.deviceToken)
      .filter(Boolean);
    const userIds = event.booking.business.users
      .map((u) => u.id)
      .filter(Boolean);

    if (tokens.length === 0) continue;

    const dateStr = event.eventAt ? formatEventDate(event.eventAt) : "your upcoming event";
    const eventType = event.functionType || "Event";
    const customer = event.booking.customerName ? ` for ${event.booking.customerName}` : "";
    const location = event.eventLocation ? ` at ${event.eventLocation}` : "";
    const guests = event.guestCount ? ` (${event.guestCount} guests)` : "";

    const title = "Event Reminder - 48 Hours to Go";
    const body = `Your ${eventType}${customer} is on ${dateStr}${location}${guests}. Start your preparations!`;

    const notifData = {
      screen: "bookingDetails",
      bookingId: event.booking.id,
      bookingEventId: event.id,
    };

    try {
      await prisma.userNotification.createMany({
        data: userIds.map((userId) => ({
          userId,
          title,
          body,
          type: "event_reminder",
          data: notifData,
        })),
        skipDuplicates: true,
      });
    } catch (err) {
      console.error(`[EventReminder] UserNotification save failed for event ${event.id}:`, err.message);
    }

    try {
      const result = await sendPushNotifications(tokens, { title, body, data: notifData });
      console.log(
        `[EventReminder] Event ${event.id} — sent: ${result.successCount}, errors: ${result.errorCount}, skipped: ${result.skippedCount}`,
      );
    } catch (err) {
      console.error(`[EventReminder] Push failed for event ${event.id}:`, err.message);
    }
  }
}

/**
 * Starts the hourly cron job.
 * Called once from server.js at startup.
 */
function startEventReminderCron() {
  // Runs at the top of every hour: 0 * * * *
  cron.schedule("0 * * * *", () => {
    console.log("[EventReminder] Cron triggered at", new Date().toISOString());
    void sendEventReminders();
  });
  console.log("[EventReminder] Hourly reminder cron started.");
}

module.exports = { startEventReminderCron, sendEventReminders };
