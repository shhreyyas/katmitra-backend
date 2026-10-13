const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { getRequestedLanguage } = require("../utils/localization");
const { localizeStoredNotification } = require("../utils/notificationTranslations");

function formatNotification(row, lang) {
  const { title, body } = localizeStoredNotification(row, lang);
  // `i18n` is only for re-rendering here; the app gets the deep-link fields.
  const { i18n: _i18n, ...data } = row.data && typeof row.data === "object" ? row.data : {};
  return {
    id: row.id,
    title,
    body,
    type: row.type,
    data,
    is_read: row.isRead,
    read_at: row.readAt ? row.readAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  };
}

/** GET /api/v1/notifications */
exports.listNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const lang = getRequestedLanguage(req);
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;

    const [total, unreadCount, rows] = await prisma.$transaction([
      prisma.userNotification.count({ where: { userId } }),
      prisma.userNotification.count({ where: { userId, isRead: false } }),
      prisma.userNotification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return successResponse(res, "Notifications", {
      notifications: rows.map((row) => formatNotification(row, lang)),
      unread_count: unreadCount,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("listNotifications:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** GET /api/v1/notifications/unread-count */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const count = await prisma.userNotification.count({
      where: { userId, isRead: false },
    });
    return successResponse(res, "Unread count", { unread_count: count });
  } catch (error) {
    console.error("getUnreadCount:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PUT /api/v1/notifications/:id/read */
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const notification = await prisma.userNotification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      return errorResponse(res, "Notification not found", 404, "NOT_FOUND");
    }

    if (!notification.isRead) {
      await prisma.userNotification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      });
    }

    return successResponse(res, "Marked as read");
  } catch (error) {
    console.error("markAsRead:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PUT /api/v1/notifications/read-all */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    await prisma.userNotification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return successResponse(res, "All notifications marked as read");
  } catch (error) {
    console.error("markAllAsRead:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
