const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");
const {
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  listBusinessCategories,
  createBusinessCategory,
  updateBusinessCategory,
  deleteBusinessCategory,
} = require("../controllers/categoryController");

router.get("/v1/get-category", getCategory);

router.post("/v1/create-category", authMiddleware, adminMiddleware, createCategory);

router.put("/v1/update-category/:id", authMiddleware, adminMiddleware, updateCategory);

router.delete("/v1/delete-category/:id", authMiddleware, adminMiddleware, deleteCategory);

// Business-scoped: global categories merged with this business's own private
// ones. Update/delete only ever succeed on a category this business owns —
// global categories are read-only from these routes (see updateBusinessCategory/
// deleteBusinessCategory's ownership check).
router.get("/v1/menu-categories", authMiddleware, businessContextMiddleware, listBusinessCategories);

router.post("/v1/menu-categories", authMiddleware, businessContextMiddleware, createBusinessCategory);

router.put("/v1/menu-categories/:id", authMiddleware, businessContextMiddleware, updateBusinessCategory);

router.delete("/v1/menu-categories/:id", authMiddleware, businessContextMiddleware, deleteBusinessCategory);

module.exports = router;
