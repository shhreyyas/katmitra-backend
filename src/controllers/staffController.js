const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { normalizeOptionalPhone } = require("../utils/validators");

const STAFF_ROLES = new Set([
  "CHEF",
  "HELPER",
  "WAITER",
  "MANAGER",
  "CLEANER",
  "VIP_SERVICE_BOY",
  "COUNTER_STAFF",
  "DECORATION_STAFF",
]);

const STAFF_STATUSES = new Set(["AVAILABLE", "BUSY", "ON_LEAVE", "INACTIVE"]);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function serializeStaff(row) {
  return {
    id: row.id,
    business_id: row.businessId,
    name: row.name,
    phone: row.phone ?? null,
    role: row.role,
    daily_charge: row.dailyCharge != null ? num(row.dailyCharge) : null,
    status: row.status,
    is_available: row.isAvailable,
    is_active: row.isActive,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function eventCalendarDay(eventAt) {
  if (!eventAt) return null;
  const d = new Date(eventAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function findStaffConflicts(staffId, targetEventAt, excludeEventId, force) {
  if (force) return [];
  const day = eventCalendarDay(targetEventAt);
  if (!day) return [];
  const assignments = await prisma.eventStaff.findMany({
    where: {
      staffId,
      ...(excludeEventId ? { bookingEventId: { not: excludeEventId } } : {}),
      bookingEvent: { eventAt: { not: null } },
    },
    include: {
      bookingEvent: {
        select: {
          id: true,
          eventAt: true,
          functionType: true,
          booking: { select: { bookingCode: true, customerName: true } },
        },
      },
    },
  });
  return assignments.filter((a) => {
    const evDay = eventCalendarDay(a.bookingEvent?.eventAt);
    return evDay === day;
  });
}

async function listStaff(req, res) {
  try {
    const businessId = req.businessId;
    const role = req.query.role ? String(req.query.role).toUpperCase() : null;
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const availableOnly =
      req.query.available_only === "1" || req.query.available_only === "true";
    const where = { businessId, isActive: true };
    if (role) {
      if (!STAFF_ROLES.has(role)) {
        return errorResponse(res, "Invalid role", 200, "VALIDATION_ERROR");
      }
      where.role = role;
    }
    if (status) {
      if (!STAFF_STATUSES.has(status)) {
        return errorResponse(res, "Invalid status", 200, "VALIDATION_ERROR");
      }
      where.status = status;
    }
    if (availableOnly) {
      where.isAvailable = true;
      where.status = "AVAILABLE";
    }
    const rows = await prisma.staff.findMany({
      where,
      orderBy: [{ name: "asc" }],
    });
    return successResponse(res, "OK", { staff: rows.map(serializeStaff) });
  } catch (e) {
    console.error("listStaff:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function createStaff(req, res) {
  try {
    const businessId = req.businessId;
    const body = req.body || {};
    const name = String(body.name ?? "").trim();
    if (!name) {
      return errorResponse(res, "Name is required", 200, "VALIDATION_ERROR");
    }
    const role = String(body.role ?? "").toUpperCase();
    if (!STAFF_ROLES.has(role)) {
      return errorResponse(res, "Invalid role", 200, "VALIDATION_ERROR");
    }
    const status = body.status
      ? String(body.status).toUpperCase()
      : "AVAILABLE";
    if (!STAFF_STATUSES.has(status)) {
      return errorResponse(res, "Invalid status", 200, "VALIDATION_ERROR");
    }
    const phone = normalizeOptionalPhone(body.phone);
    if (phone === null) {
      return errorResponse(res, "Phone must be a 10-digit number", 200, "VALIDATION_ERROR");
    }
    const row = await prisma.staff.create({
      data: {
        businessId,
        name,
        phone: phone || null,
        role,
        dailyCharge:
          body.daily_charge != null
            ? String(Math.max(0, num(body.daily_charge)))
            : null,
        status,
        isAvailable: body.is_available !== false,
        isActive: true,
      },
    });
    return successResponse(res, "Staff created", serializeStaff(row));
  } catch (e) {
    console.error("createStaff:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function updateStaff(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const existing = await prisma.staff.findFirst({
      where: { id, businessId, isActive: true },
    });
    if (!existing) {
      return errorResponse(res, "Staff not found", 404, "NOT_FOUND");
    }
    const body = req.body || {};
    const data = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return errorResponse(res, "Name is required", 200, "VALIDATION_ERROR");
      }
      data.name = name;
    }
    if (body.phone !== undefined) {
      const phone = normalizeOptionalPhone(body.phone);
      if (phone === null) {
        return errorResponse(res, "Phone must be a 10-digit number", 200, "VALIDATION_ERROR");
      }
      data.phone = phone || null;
    }
    if (body.role !== undefined) {
      const role = String(body.role).toUpperCase();
      if (!STAFF_ROLES.has(role)) {
        return errorResponse(res, "Invalid role", 200, "VALIDATION_ERROR");
      }
      data.role = role;
    }
    if (body.daily_charge !== undefined) {
      data.dailyCharge =
        body.daily_charge == null
          ? null
          : String(Math.max(0, num(body.daily_charge)));
    }
    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (!STAFF_STATUSES.has(status)) {
        return errorResponse(res, "Invalid status", 200, "VALIDATION_ERROR");
      }
      data.status = status;
    }
    if (body.is_available !== undefined) {
      data.isAvailable = Boolean(body.is_available);
    }
    const row = await prisma.staff.update({ where: { id }, data });
    return successResponse(res, "Staff updated", serializeStaff(row));
  } catch (e) {
    console.error("updateStaff:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function deleteStaff(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const existing = await prisma.staff.findFirst({
      where: { id, businessId, isActive: true },
    });
    if (!existing) {
      return errorResponse(res, "Staff not found", 404, "NOT_FOUND");
    }
    await prisma.staff.update({
      where: { id },
      data: { isActive: false, isAvailable: false },
    });
    return successResponse(res, "Staff deleted", { id });
  } catch (e) {
    console.error("deleteStaff:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function getStaffById(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const row = await prisma.staff.findFirst({
      where: { id, businessId, isActive: true },
      include: {
        assignments: {
          include: {
            bookingEvent: {
              select: {
                id: true,
                eventAt: true,
                functionType: true,
                status: true,
                booking: { select: { id: true, bookingCode: true, customerName: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });
    if (!row) {
      return errorResponse(res, "Staff not found", 404, "NOT_FOUND");
    }
    const assigned_events = row.assignments.map((a) => ({
      event_id: a.bookingEventId,
      booking_id: a.bookingEvent?.booking?.id ?? null,
      booking_code: a.bookingEvent?.booking?.bookingCode ?? null,
      customer_name: a.bookingEvent?.booking?.customerName ?? null,
      event_at: a.bookingEvent?.eventAt?.toISOString?.() ?? null,
      function_type: a.bookingEvent?.functionType ?? null,
      role: a.role,
    }));
    return successResponse(res, "OK", {
      ...serializeStaff(row),
      assigned_events,
    });
  } catch (e) {
    console.error("getStaffById:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

function serializeEventStaffAssignment(row) {
  return {
    id: row.id,
    booking_event_id: row.bookingEventId,
    staff_id: row.staffId,
    role: row.role,
    allow_conflict: row.allowConflict,
    staff: row.staff ? serializeStaff(row.staff) : undefined,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
  };
}

async function getEventStaff(req, res) {
  try {
    const businessId = req.businessId;
    const eventId = req.params.eventId;
    const event = await prisma.bookingEvent.findFirst({
      where: { id: eventId, booking: { businessId } },
    });
    if (!event) {
      return errorResponse(res, "Event not found", 404, "NOT_FOUND");
    }
    const rows = await prisma.eventStaff.findMany({
      where: { bookingEventId: eventId },
      include: { staff: true },
      orderBy: { createdAt: "asc" },
    });
    const byRole = {};
    for (const r of rows) {
      if (!byRole[r.role]) byRole[r.role] = [];
      byRole[r.role].push(serializeEventStaffAssignment(r));
    }
    const role_counts = Object.fromEntries(
      Object.entries(byRole).map(([role, list]) => [role, list.length]),
    );
    return successResponse(res, "OK", {
      assignments: rows.map(serializeEventStaffAssignment),
      by_role: byRole,
      role_counts,
    });
  } catch (e) {
    console.error("getEventStaff:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function assignEventStaff(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId ?? null;
    const eventId = req.params.eventId;
    const body = req.body || {};
    const force = body.force === true || body.force === "true";
    const items = Array.isArray(body.assignments) ? body.assignments : [];
    if (!items.length) {
      return errorResponse(res, "No assignments provided", 200, "VALIDATION_ERROR");
    }
    const event = await prisma.bookingEvent.findFirst({
      where: { id: eventId, booking: { businessId } },
    });
    if (!event) {
      return errorResponse(res, "Event not found", 404, "NOT_FOUND");
    }
    const conflicts = [];
    for (const item of items) {
      const staffId = String(item.staff_id ?? item.staffId ?? "").trim();
      const role = String(item.role ?? "").toUpperCase();
      if (!staffId || !STAFF_ROLES.has(role)) continue;
      const staff = await prisma.staff.findFirst({
        where: { id: staffId, businessId, isActive: true },
      });
      if (!staff) {
        return errorResponse(res, "Staff not found", 404, "NOT_FOUND");
      }
      if (!force && (!staff.isAvailable || staff.status !== "AVAILABLE")) {
        return errorResponse(
          res,
          `${staff.name} is not available`,
          200,
          "VALIDATION_ERROR",
        );
      }
      const existingConflicts = await findStaffConflicts(
        staffId,
        event.eventAt,
        eventId,
        force,
      );
      if (existingConflicts.length > 0) {
        conflicts.push({
          staff_id: staffId,
          staff_name: staff.name,
          conflicts: existingConflicts.map((c) => ({
            event_id: c.bookingEventId,
            booking_code: c.bookingEvent?.booking?.bookingCode ?? null,
            event_at: c.bookingEvent?.eventAt?.toISOString?.() ?? null,
          })),
        });
      }
    }
    if (conflicts.length > 0 && !force) {
      return errorResponse(res, "Staff scheduling conflict", 200, "CONFLICT", {
        conflicts,
      });
    }
    const created = [];
    for (const item of items) {
      const staffId = String(item.staff_id ?? item.staffId ?? "").trim();
      const role = String(item.role ?? "").toUpperCase();
      if (!staffId || !STAFF_ROLES.has(role)) continue;
      const row = await prisma.eventStaff.upsert({
        where: {
          bookingEventId_staffId: { bookingEventId: eventId, staffId },
        },
        create: {
          bookingEventId: eventId,
          staffId,
          role,
          assignedByUserId: userId,
          allowConflict: force,
        },
        update: { role, allowConflict: force, assignedByUserId: userId },
      });
      created.push(row);
    }
    const rows = await prisma.eventStaff.findMany({
      where: { bookingEventId: eventId },
      include: { staff: true },
    });
    return successResponse(res, "Staff assigned", {
      assignments: rows.map(serializeEventStaffAssignment),
    });
  } catch (e) {
    console.error("assignEventStaff:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function unassignEventStaff(req, res) {
  try {
    const businessId = req.businessId;
    const eventId = req.params.eventId;
    const staffId = req.params.staffId;
    const event = await prisma.bookingEvent.findFirst({
      where: { id: eventId, booking: { businessId } },
    });
    if (!event) {
      return errorResponse(res, "Event not found", 404, "NOT_FOUND");
    }
    await prisma.eventStaff.deleteMany({
      where: { bookingEventId: eventId, staffId },
    });
    return successResponse(res, "Staff unassigned", { event_id: eventId, staff_id: staffId });
  } catch (e) {
    console.error("unassignEventStaff:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function listAvailableStaffForEvent(req, res) {
  try {
    const businessId = req.businessId;
    const eventId = req.params.eventId;
    const role = req.query.role ? String(req.query.role).toUpperCase() : null;
    const event = await prisma.bookingEvent.findFirst({
      where: { id: eventId, booking: { businessId } },
    });
    if (!event) {
      return errorResponse(res, "Event not found", 404, "NOT_FOUND");
    }
    const where = {
      businessId,
      isActive: true,
      isAvailable: true,
      status: "AVAILABLE",
    };
    if (role) {
      if (!STAFF_ROLES.has(role)) {
        return errorResponse(res, "Invalid role", 200, "VALIDATION_ERROR");
      }
      where.role = role;
    }
    const all = await prisma.staff.findMany({
      where,
      orderBy: [{ name: "asc" }],
    });
    const available = [];
    for (const s of all) {
      const conflicts = await findStaffConflicts(
        s.id,
        event.eventAt,
        eventId,
        false,
      );
      if (conflicts.length === 0) available.push(serializeStaff(s));
    }
    return successResponse(res, "OK", { staff: available });
  } catch (e) {
    console.error("listAvailableStaffForEvent:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

module.exports = {
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  getStaffById,
  getEventStaff,
  assignEventStaff,
  unassignEventStaff,
  listAvailableStaffForEvent,
};
