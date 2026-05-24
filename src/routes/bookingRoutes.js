const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const businessContextMiddleware = require("../middleware/businessContextMiddleware");
const {
  createBooking,
  patchBooking,
  createEvent,
  updateEvent,
  deleteEvent,
  getDashboard,
  listBookings,
  searchBookingCustomers,
  getBooking,
  completeBookingOrder,
  deleteBooking,
  cancelBooking,
  confirmBooking,
  recordPayment,
  triggerBookingPdfJobs,
  retryBookingPdfJob,
} = require("../controllers/bookingController");
const { listScheduleEvents } = require("../controllers/scheduleController");

// Create Booking
router.post(
  "/v1/createBooking",
  authMiddleware,
  businessContextMiddleware,
  createBooking,
);

// Update Booking
router.post(
  "/v1/updateBooking/:id",
  authMiddleware,
  businessContextMiddleware,
  patchBooking,
);

// Delete Booking
router.delete(
  "/v1/deleteBooking/:id",
  authMiddleware,
  businessContextMiddleware,
  deleteBooking,
);

// Dashboard aggregates (mobile home)
router.get(
  "/v1/dashboard",
  authMiddleware,
  businessContextMiddleware,
  getDashboard,
);

// Past customer search (new booking autocomplete)
router.get(
  "/v1/bookings/customers/search",
  authMiddleware,
  businessContextMiddleware,
  searchBookingCustomers,
);

// List Bookings
router.get(
  "/v1/listBookings",
  authMiddleware,
  businessContextMiddleware,
  listBookings,
);

// Schedule tab — bookings + quotations in one response
router.get(
  "/v1/scheduleEvents",
  authMiddleware,
  businessContextMiddleware,
  listScheduleEvents,
);

// Get Booking
router.get(
  "/v1/getBooking/:id",
  authMiddleware,
  businessContextMiddleware,
  getBooking,
);

// Confirm Booking
router.post(
  "/v1/bookings/:id/confirm",
  authMiddleware,
  businessContextMiddleware,
  confirmBooking,
);

// Mark booking order manually completed
router.post(
  "/v1/bookings/:id/completeOrder",
  authMiddleware,
  businessContextMiddleware,
  completeBookingOrder,
);

// Cancel confirmed booking
router.post(
  "/v1/bookings/:id/cancel",
  authMiddleware,
  businessContextMiddleware,
  cancelBooking,
);

// Update Booking Event
router.post(
  "/v1/bookings/:id/createEvent",
  authMiddleware,
  businessContextMiddleware,
  createEvent,
);

// Update Booking Event
router.patch(
  "/v1/bookings/:id/updateEvent/:eventId",
  authMiddleware,
  businessContextMiddleware,
  updateEvent,
);

// Delete Booking Event
router.delete(
  "/v1/bookings/:id/deleteEvent/:eventId",
  authMiddleware,
  businessContextMiddleware,
  deleteEvent,
);

// Record Payment
router.post(
  "/v1/bookigrecordPayment/:id",
  authMiddleware,
  businessContextMiddleware,
  recordPayment,
);

// Trigger Booking PDF Jobs
router.post(
  "/v1/triggerBookingPdfJobs/:id",
  authMiddleware,
  businessContextMiddleware,
  triggerBookingPdfJobs,
);

// Retry Booking PDF Job
router.post(
  "/v1/retryBookingPdfJob/:id/:jobId",
  authMiddleware,
  businessContextMiddleware,
  retryBookingPdfJob,
);

module.exports = router;
