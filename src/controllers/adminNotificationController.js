const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { logActivity } = require("../utils/activityLog");

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

/** POST /api/admin/v1/notifications — log broadcast (FCM send when configured server-side). */
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

    const { sentCount, tokensCount } = await countBroadcastAudience();

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
      message: `Broadcast "${title}" to ${sentCount} user(s)`,
      actorUserId: req.user?.userId ?? null,
      meta: { sent_count: sentCount, tokens_count: tokensCount },
    });

    // Push delivery is not wired in the API yet; mobile uses FCM tokens stored on the User row.
    return successResponse(
      res,
      "Notification logged",
      {
        notification: formatNotificationLog(row),
        delivery_note:
          tokensCount > 0
            ? "Logged for audit. Configure Firebase Admin on the server to deliver pushes."
            : "Logged for audit. No active FCM tokens found for caterer accounts.",
      },
      201,
    );
  } catch (error) {
    console.error("sendNotification admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
