const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");
const {
  createQuotation,
  listQuotations,
  getQuotation,
  updateQuotation,
  deleteQuotation,
  convertQuotationToBooking,
} = require("../controllers/quotationController");

router.post("/v1/quotations", authMiddleware, businessContextMiddleware, createQuotation);
router.get("/v1/quotations", authMiddleware, businessContextMiddleware, listQuotations);
router.get("/v1/quotations/:id", authMiddleware, businessContextMiddleware, getQuotation);
router.patch("/v1/quotations/:id", authMiddleware, businessContextMiddleware, updateQuotation);
router.delete("/v1/quotations/:id", authMiddleware, businessContextMiddleware, deleteQuotation);
router.post(
  "/v1/quotations/:id/convertToBooking",
  authMiddleware,
  businessContextMiddleware,
  convertQuotationToBooking,
);

module.exports = router;
