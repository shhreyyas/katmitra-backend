const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  getDashboard,
  listMenuCategories,
  listSupplyCategories,
} = require("../controllers/adminController");
const {
  createSupplyCategory,
  updateSupplyCategory,
  deleteSupplyCategory,
} = require("../controllers/supplyCategoryController");
const {
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");
const {
  listBusinesses,
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} = require("../controllers/adminMenuController");
const {
  listSupplyItems,
  createSupplyItem,
  updateSupplyItem,
  deleteSupplyItem,
} = require("../controllers/adminSupplyController");
const {
  listUnits,
  createUnit,
  updateUnit,
  deleteUnit,
} = require("../controllers/adminUnitController");
const {
  listServiceTypes,
  createServiceType,
  updateServiceType,
  deleteServiceType,
} = require("../controllers/adminServiceTypeController");
const {
  listExtraServices,
  createExtraService,
  updateExtraService,
  deleteExtraService,
} = require("../controllers/adminExtraServiceController");
const {
  listSchemas,
  downloadTemplate,
  runBulkImport,
} = require("../controllers/adminBulkImportController");
const {
  listUsers,
  getUser,
  setUserSuspended,
  updateUserSubscription,
  recordOfflinePayment,
} = require("../controllers/adminUserController");
const {
  listSubscriptions,
  getSubscription,
  updateSubscription,
} = require("../controllers/adminSubscriptionController");
const { listPayments, updatePayment } = require("../controllers/adminPaymentController");
const {
  listAccessCodes,
  createAccessCodes,
  updateAccessCode,
} = require("../controllers/adminAccessCodeController");
const {
  listBookings: listAdminBookings,
  getBooking: getAdminBooking,
} = require("../controllers/adminBookingController");
const {
  listQuotations: listAdminQuotations,
  getQuotation: getAdminQuotation,
} = require("../controllers/adminQuotationController");
const {
  listNotifications,
  sendNotification,
} = require("../controllers/adminNotificationController");
const {
  listSupportMessages,
  getSupportMessage,
  updateSupportMessage,
} = require("../controllers/adminSupportController");
const {
  getAppVersionConfig,
  updateAppVersionConfig,
} = require("../controllers/adminAppVersionController");
const {
  getSettings,
  updateSettings,
} = require("../controllers/adminSettingsController");
const { listLogs } = require("../controllers/adminLogsController");

router.get("/admin/v1/dashboard", authMiddleware, adminMiddleware, getDashboard);
router.get(
  "/admin/v1/menu-categories",
  authMiddleware,
  adminMiddleware,
  listMenuCategories,
);

router.post(
  "/admin/v1/menu-categories",
  authMiddleware,
  adminMiddleware,
  createCategory,
);
router.put(
  "/admin/v1/menu-categories/:id",
  authMiddleware,
  adminMiddleware,
  updateCategory,
);
router.delete(
  "/admin/v1/menu-categories/:id",
  authMiddleware,
  adminMiddleware,
  deleteCategory,
);

router.get(
  "/admin/v1/businesses",
  authMiddleware,
  adminMiddleware,
  listBusinesses,
);
router.get(
  "/admin/v1/menu-items",
  authMiddleware,
  adminMiddleware,
  listMenuItems,
);
router.post(
  "/admin/v1/menu-items",
  authMiddleware,
  adminMiddleware,
  createMenuItem,
);
router.put(
  "/admin/v1/menu-items/:id",
  authMiddleware,
  adminMiddleware,
  updateMenuItem,
);
router.delete(
  "/admin/v1/menu-items/:id",
  authMiddleware,
  adminMiddleware,
  deleteMenuItem,
);

router.get(
  "/admin/v1/supply-categories",
  authMiddleware,
  adminMiddleware,
  listSupplyCategories,
);
router.post(
  "/admin/v1/supply-categories",
  authMiddleware,
  adminMiddleware,
  createSupplyCategory,
);
router.put(
  "/admin/v1/supply-categories/:id",
  authMiddleware,
  adminMiddleware,
  updateSupplyCategory,
);
router.delete(
  "/admin/v1/supply-categories/:id",
  authMiddleware,
  adminMiddleware,
  deleteSupplyCategory,
);

router.get("/admin/v1/units", authMiddleware, adminMiddleware, listUnits);
router.post("/admin/v1/units", authMiddleware, adminMiddleware, createUnit);
router.put("/admin/v1/units/:id", authMiddleware, adminMiddleware, updateUnit);
router.delete("/admin/v1/units/:id", authMiddleware, adminMiddleware, deleteUnit);
router.get(
  "/admin/v1/supply-items",
  authMiddleware,
  adminMiddleware,
  listSupplyItems,
);
router.post(
  "/admin/v1/supply-items",
  authMiddleware,
  adminMiddleware,
  createSupplyItem,
);
router.put(
  "/admin/v1/supply-items/:id",
  authMiddleware,
  adminMiddleware,
  updateSupplyItem,
);
router.delete(
  "/admin/v1/supply-items/:id",
  authMiddleware,
  adminMiddleware,
  deleteSupplyItem,
);

router.get(
  "/admin/v1/service-types",
  authMiddleware,
  adminMiddleware,
  listServiceTypes,
);
router.post(
  "/admin/v1/service-types",
  authMiddleware,
  adminMiddleware,
  createServiceType,
);
router.put(
  "/admin/v1/service-types/:id",
  authMiddleware,
  adminMiddleware,
  updateServiceType,
);
router.delete(
  "/admin/v1/service-types/:id",
  authMiddleware,
  adminMiddleware,
  deleteServiceType,
);

router.get(
  "/admin/v1/extra-services",
  authMiddleware,
  adminMiddleware,
  listExtraServices,
);
router.post(
  "/admin/v1/extra-services",
  authMiddleware,
  adminMiddleware,
  createExtraService,
);
router.put(
  "/admin/v1/extra-services/:id",
  authMiddleware,
  adminMiddleware,
  updateExtraService,
);
router.delete(
  "/admin/v1/extra-services/:id",
  authMiddleware,
  adminMiddleware,
  deleteExtraService,
);

router.get(
  "/admin/v1/bulk-import/schemas",
  authMiddleware,
  adminMiddleware,
  listSchemas,
);
router.get(
  "/admin/v1/bulk-import/templates/:type",
  authMiddleware,
  adminMiddleware,
  downloadTemplate,
);
router.post(
  "/admin/v1/bulk-import",
  authMiddleware,
  adminMiddleware,
  runBulkImport,
);

router.get("/admin/v1/users", authMiddleware, adminMiddleware, listUsers);
router.get("/admin/v1/users/:id", authMiddleware, adminMiddleware, getUser);
router.patch(
  "/admin/v1/users/:id/suspend",
  authMiddleware,
  adminMiddleware,
  setUserSuspended,
);
router.patch(
  "/admin/v1/users/:id/subscription",
  authMiddleware,
  adminMiddleware,
  updateUserSubscription,
);
router.post(
  "/admin/v1/users/:id/offline-payment",
  authMiddleware,
  adminMiddleware,
  recordOfflinePayment,
);

router.get(
  "/admin/v1/subscriptions",
  authMiddleware,
  adminMiddleware,
  listSubscriptions,
);
router.get(
  "/admin/v1/subscriptions/:id",
  authMiddleware,
  adminMiddleware,
  getSubscription,
);
router.patch(
  "/admin/v1/subscriptions/:id",
  authMiddleware,
  adminMiddleware,
  updateSubscription,
);

router.get("/admin/v1/payments", authMiddleware, adminMiddleware, listPayments);
router.patch(
  "/admin/v1/payments/:id",
  authMiddleware,
  adminMiddleware,
  updatePayment,
);

router.get(
  "/admin/v1/access-codes",
  authMiddleware,
  adminMiddleware,
  listAccessCodes,
);
router.post(
  "/admin/v1/access-codes",
  authMiddleware,
  adminMiddleware,
  createAccessCodes,
);
router.patch(
  "/admin/v1/access-codes/:id",
  authMiddleware,
  adminMiddleware,
  updateAccessCode,
);

router.get(
  "/admin/v1/bookings",
  authMiddleware,
  adminMiddleware,
  listAdminBookings,
);
router.get(
  "/admin/v1/bookings/:id",
  authMiddleware,
  adminMiddleware,
  getAdminBooking,
);

router.get(
  "/admin/v1/quotations",
  authMiddleware,
  adminMiddleware,
  listAdminQuotations,
);
router.get(
  "/admin/v1/quotations/:id",
  authMiddleware,
  adminMiddleware,
  getAdminQuotation,
);

router.get(
  "/admin/v1/notifications",
  authMiddleware,
  adminMiddleware,
  listNotifications,
);
router.post(
  "/admin/v1/notifications",
  authMiddleware,
  adminMiddleware,
  sendNotification,
);

router.get(
  "/admin/v1/support",
  authMiddleware,
  adminMiddleware,
  listSupportMessages,
);
router.get(
  "/admin/v1/support/:id",
  authMiddleware,
  adminMiddleware,
  getSupportMessage,
);
router.patch(
  "/admin/v1/support/:id",
  authMiddleware,
  adminMiddleware,
  updateSupportMessage,
);

router.get(
  "/admin/v1/app-version",
  authMiddleware,
  adminMiddleware,
  getAppVersionConfig,
);
router.put(
  "/admin/v1/app-version",
  authMiddleware,
  adminMiddleware,
  updateAppVersionConfig,
);

router.get(
  "/admin/v1/settings",
  authMiddleware,
  adminMiddleware,
  getSettings,
);
router.put(
  "/admin/v1/settings",
  authMiddleware,
  adminMiddleware,
  updateSettings,
);

router.get("/admin/v1/logs", authMiddleware, adminMiddleware, listLogs);

module.exports = router;
