const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");
const {
  listDishes,
  getDish,
  createDish,
  updateDish,
  deleteDish,
  bulkDeleteDishes,
} = require("../controllers/dishController");

router.get("/v1/dishes", authMiddleware, businessContextMiddleware, listDishes);
router.get("/v1/dishes/:id", authMiddleware, businessContextMiddleware, getDish);
router.post("/v1/dishes", authMiddleware, businessContextMiddleware, createDish);
router.post("/v1/dishes/bulk-delete", authMiddleware, businessContextMiddleware, bulkDeleteDishes);
router.patch("/v1/dishes/:id", authMiddleware, businessContextMiddleware, updateDish);
router.delete("/v1/dishes/:id", authMiddleware, businessContextMiddleware, deleteDish);

module.exports = router;

