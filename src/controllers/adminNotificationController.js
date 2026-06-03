const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { logActivity } = require("../utils/activityLog");
const { sendPushNotifications } = require("../utils/expoPush");

function formatNotificationLog(row) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    sent_to: row.sentTo,
    sent_count: row.sentCount,
    tokens_count: row.tokensCount,
    created_by_user_id: row.createdByUserId,
    created_by_name: row.createdBy?.name ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

const activeCatererWhere = {
  role: { not: "admin" },
  deletedAt: null,
};

/**
 * A user receives push notifications only when:
 *  1. They are an active caterer (not admin, not deleted)
 *  2. notificationStatus = 1  (OS permission granted and not opted-out)
 *  3. They have a non-null FCM token stored on the User row
 */
const notifiableCatererWhere = {
  ...activeCatererWhere,
  notificationStatus: 1,
};

async function countBroadcastAudience() {
  const [sentCount, tokensCount] = await prisma.$transaction([
    // sentCount = all active caterers (for audit log)
    prisma.user.count({ where: activeCatererWhere }),
    // tokensCount = users who will actually receive the push
    // deviceToken now lives directly on User (no UserDevice table)
    prisma.user.count({
      where: {
        ...notifiableCatererWhere,
        deviceToken: { not: null },
      },
    }),
  ]);
  return { sentCount, tokensCount };
}

/** GET /api/admin/v1/notifications */
exports.listNotifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;

    const [total, rows] = await prisma.$transaction([
      prisma.notificationLog.count(),
      prisma.notificationLog.findMany({
        include: {
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return successResponse(res, "Notifications", {
      notifications: rows.map(formatNotificationLog),
      pagination: {
        page,
        limit,
        total,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("listNotifications admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** POST /api/admin/v1/notifications — broadcast push notification to eligible users. */
exports.sendNotification = async (req, res) => {
  try {
    const title = String(req.body?.title ?? "").trim();
    const message = String(req.body?.message ?? "").trim();

    if (!title) {
      return errorResponse(res, "Title is required", 422, "VALIDATION_ERROR");
    }
    if (!message) {
      return errorResponse(res, "Message is required", 422, "VALIDATION_ERROR");
    }

    // Fetch eligible users:
    //   - Active caterer (not admin, not deleted)
    //   - notificationStatus = 1  (OS permission granted, user has not opted out)
    //   - deviceToken is not null  (device is registered)
    const [sentCount, eligibleUsers] = await prisma.$transaction([
      prisma.user.count({ where: activeCatererWhere }),
      prisma.user.findMany({
        where: {
          ...notifiableCatererWhere,
          deviceToken: { not: null },
        },
        select: { id: true, deviceToken: true },
      }),
    ]);

    const tokens = eligibleUsers
      .map((u) => u.deviceToken)
      .filter(Boolean);

    const tokensCount = tokens.length;

    // Log first so the record exists even if push delivery partially fails.
    const row = await prisma.notificationLog.create({
      data: {
        title,
        message,
        sentTo: "all-users",
        sentCount,
        tokensCount,
        createdByUserId: req.user?.userId ?? null,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    logActivity({
      type: "notification",
      message: `Broadcast "${title}" to ${sentCount} caterer(s), ${tokensCount} device token(s)`,
      actorUserId: req.user?.userId ?? null,
      meta: { sent_count: sentCount, tokens_count: tokensCount },
    });

    // Persist a UserNotification row for every eligible user and send push in background.
    if (tokensCount > 0) {
      const notifData = { screen: "notification_detail", notificationLogId: row.id };

      // Save inbox records for each recipient
      prisma.userNotification.createMany({
        data: eligibleUsers.map((u) => ({
          userId: u.id,
          title,
          body: message,
          type: "admin_broadcast",
          data: notifData,
        })),
      }).catch((err) => console.error("[UserNotification] createMany failed:", err.message));

      sendPushNotifications(tokens, {
        title,
        body: message,
        data: notifData,
      }).then(({ successCount, errorCount, skippedCount }) => {
        console.log(
          `[ExpoPush] Broadcast "${title}": sent=${successCount} errors=${errorCount} skipped=${skippedCount}`,
        );
      }).catch((err) => {
        console.error("[ExpoPush] Broadcast failed:", err.message);
      });
    }

    const deliveryNote = tokensCount > 0
      ? `Sending to ${tokensCount} device(s). Delivery is in progress.`
      : "No active device tokens found. Notification logged for audit.";

    return successResponse(
      res,
      deliveryNote,
      {
        notification: formatNotificationLog(row),
        delivery_note: deliveryNote,
      },
      201,
    );
  } catch (error) {
    console.error("sendNotification admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
