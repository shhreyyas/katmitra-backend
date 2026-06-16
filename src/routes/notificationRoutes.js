const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} = require("../controllers/userNotificationController");

// /read-all must be registered before /:id/read to prevent
// "read-all" being swallowed by the /:id segment (defensive order).
router.get("/v1/notifications", authMiddleware, listNotifications);
router.get("/v1/notifications/unread-count", authMiddleware, getUnreadCount);
router.put("/v1/notifications/read-all", authMiddleware, markAllAsRead);
router.put("/v1/notifications/:id/read", authMiddleware, markAsRead);

module.exports = router;
