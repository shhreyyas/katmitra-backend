const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { sendReminderForEvent, REMINDER_CONFIGS } = require("../services/reminderService");
const { runReminders } = require("../services/eventReminderCron");

function formatReminder(row) {
  const event   = row.bookingEvent;
  const booking = event?.booking;
  return {
    id:           row.id,
    reminder_type: row.reminderType,
    sent_at:      row.sentAt.toISOString(),
    event: {
      id:            event?.id ?? null,
      event_at:      event?.eventAt ? new Date(event.eventAt).toISOString() : null,
      event_location: event?.eventLocation ?? null,
      function_type: event?.functionType ?? null,
      guest_count:   event?.guestCount ?? null,
    },
    booking: {
      id:            booking?.id ?? null,
      customer_name: booking?.customerName ?? null,
      business_name: booking?.business?.name ?? null,
    },
  };
}

/** GET /api/admin/v1/reminders — paginated list of sent EventReminder records */
exports.listEventReminders = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const skip  = (page - 1) * limit;

    const [total, rows] = await prisma.$transaction([
      prisma.eventReminder.count(),
      prisma.eventReminder.findMany({
        orderBy: { sentAt: "desc" },
        skip,
        take: limit,
        include: {
          bookingEvent: {
            select: {
              id:            true,
              eventAt:       true,
              eventLocation: true,
              functionType:  true,
              guestCount:    true,
              booking: {
                select: {
                  id:           true,
                  customerName: true,
                  business: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return successResponse(res, "Reminder logs", {
      reminders: rows.map(formatReminder),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 0 },
    });
  } catch (err) {
    console.error("listEventReminders:", err.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * POST /api/admin/v1/reminders/trigger
 * Manually runs the full cron job right now (all active reminder types).
 * Useful for verifying the system works without waiting for the next tick.
 */
exports.triggerCron = async (req, res) => {
  try {
    console.log("[AdminReminder] Manual cron trigger by admin:", req.user?.userId);
    void runReminders();
    return successResponse(res, "Cron job triggered — check server logs for results.");
  } catch (err) {
    console.error("triggerCron:", err.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * POST /api/admin/v1/reminders/test/:bookingEventId
 * Sends a reminder for a specific event immediately, bypassing the time window.
 * Body: { reminder_type?: "24_HOUR" | "2_HOUR" | "30_MINUTE" }
 */
exports.testEventReminder = async (req, res) => {
  try {
    const { bookingEventId } = req.params;
    const reminderType = String(req.body?.reminder_type ?? "24_HOUR").trim().toUpperCase();

    if (!REMINDER_CONFIGS[reminderType]) {
      return errorResponse(
        res,
        `Invalid reminder_type. Valid values: ${Object.keys(REMINDER_CONFIGS).join(", ")}`,
        422,
        "VALIDATION_ERROR",
      );
    }

    console.log(
      `[AdminReminder] Test reminder — event=${bookingEventId} type=${reminderType} by=${req.user?.userId}`,
    );

    const result = await sendReminderForEvent(bookingEventId, reminderType);

    if (!result.ok) {
      return errorResponse(res, result.reason ?? "Failed to send reminder", 422, "REMINDER_FAILED");
    }

    return successResponse(res, `Test reminder sent to ${result.pushSent} device(s).`, {
      ok:         true,
      push_sent:  result.pushSent,
      reminder_type: reminderType,
      booking_event_id: bookingEventId,
    });
  } catch (err) {
    console.error("testEventReminder:", err.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
