const express = require("express");
const router = express.Router();
const {
  signup,
  verifyOtp,
  signIn,
  signOut,
  resendOtp,
  forgotPassword,
  verifyForgotOtp,
  newPassword,
  resendForgotOtp,
  updateUserProfile,
  deleteUser,
  updateDevice,
  updateNotificationPreference,
  updateNotificationSettings,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const { uploadProfileImage } = require("../controllers/uploadController");

router.post("/v1/signup", signup);
router.post("/v1/verify-otp", verifyOtp);
router.post("/v1/signin", signIn);
router.post("/v1/resend-otp", resendOtp);
router.post("/v1/forgot-password", forgotPassword);
router.post("/v1/verify-forgot-otp", verifyForgotOtp);
router.post("/v1/resend-forgot-otp", resendForgotOtp);
router.post("/v1/new-password", newPassword);
router.post("/v1/signout", authMiddleware, signOut);
router.patch("/v1/device", authMiddleware, updateDevice);
router.patch("/v1/user/notification", authMiddleware, updateNotificationPreference);
router.patch("/v1/user/notification-update", authMiddleware, updateNotificationSettings);
router.post("/v1/upload-profile-image", authMiddleware, uploadProfileImage);
router.patch("/v1/user/profile", authMiddleware, updateUserProfile);
router.post("/v1/delete-user", deleteUser);

// User notifications
const {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} = require("../controllers/userNotificationController");
router.get("/v1/notifications", authMiddleware, listNotifications);
router.get("/v1/notifications/unread-count", authMiddleware, getUnreadCount);
router.put("/v1/notifications/read-all", authMiddleware, markAllAsRead);
router.put("/v1/notifications/:id/read", authMiddleware, markAsRead);

module.exports = router;
