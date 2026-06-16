const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
// Express 5: req.body stays undefined if Content-Type is not parsed or body is empty;
// normalize so route handlers can destructure without throwing.
app.use((req, _res, next) => {
  if (req.body === undefined || req.body === null) {
    req.body = {};
  }
  next();
});
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "uploads")),
);

// Routes (see test.md — paths under /api)
const authRoutes = require("./routes/authRoutes");
app.use("/api", authRoutes);

const businessRoutes = require("./routes/businessRoutes");
app.use("/api", businessRoutes);

const menuRoutes = require("./routes/menuRoutes");
app.use("/api", menuRoutes);

const categoryRoutes = require("./routes/categoryRoutes");
app.use("/api", categoryRoutes);

const bookingRoutes = require("./routes/bookingRoutes");
app.use("/api", bookingRoutes);

const dishRoutes = require("./routes/dishRoutes");
app.use("/api", dishRoutes);

const quotationRoutes = require("./routes/quotationRoutes");
app.use("/api", quotationRoutes);

const contactRoutes = require("./routes/contactRoutes");
app.use("/api", contactRoutes);

const appVersionRoutes = require("./routes/appVersionRoutes");
app.use("/api", appVersionRoutes);

const supplyRoutes = require("./routes/supplyRoutes");
app.use("/api", supplyRoutes);

const staffRoutes = require("./routes/staffRoutes");
app.use("/api", staffRoutes);

const extraServiceRoutes = require("./routes/extraServiceRoutes");
app.use("/api", extraServiceRoutes);

const notificationRoutes = require("./routes/notificationRoutes");
app.use("/api", notificationRoutes);

const adminRoutes = require("./routes/adminRoutes");
app.use("/api", adminRoutes);

// Test Route
app.get("/", (req, res) => {
  res.send("Catering API Running");
});

module.exports = app;
