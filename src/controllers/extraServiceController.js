const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const {
  computeBookingTotalDueFromEvents,
  deriveEventFoodSubtotal,
  paymentStatusFromAmounts,
  num,
} = require("./bookingPricingHelpers");

const PRICING_TYPES = new Set(["FIXED", "PER_UNIT", "PER_GUEST"]);

function deriveIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

function extraServiceVisibilityOrBranches(businessId, userId) {
  return [
    { businessId, OR: [{ isGlobal: true }, { createdByUserId: userId }] },
    { businessId: null, OR: [{ createdByUserId: userId }, { isGlobal: true }] },
    { createdByUserId: userId },
  ];
}

function serializeExtraService(row) {
  return {
    id: row.id,
    business_id: row.businessId ?? null,
    is_global: deriveIsGlobal(row.businessId, row.createdByUserId),
    title: row.title,
    description: row.description ?? null,
    pricing_type: row.pricingType,
    price: num(row.price),
    is_optional: row.isOptional,
    is_active: row.isActive,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function serializeExtraServiceLine(row) {
  return {
    id: row.id,
    booking_id: row.bookingId,
    event_id: row.eventId ?? null,
    extra_service_id: row.extraServiceId,
    quantity: row.quantity,
    unit_price_snapshot: num(row.unitPriceSnapshot),
    line_total: num(row.lineTotal),
    title_snapshot: row.titleSnapshot,
    pricing_type_snapshot: row.pricingTypeSnapshot,
  };
}

function computeLineTotal(pricingType, unitPrice, quantity, guestCount) {
  const price = Math.max(0, num(unitPrice));
  const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
  const guests = Math.max(0, parseInt(String(guestCount), 10) || 0);
  if (pricingType === "FIXED") return price;
  if (pricingType === "PER_GUEST") return price * Math.max(1, guests);
  return price * qty;
}

function resolveTargetEventId(booking, body) {
  const fromBody = String(body.event_id ?? body.eventId ?? "").trim();
  if (fromBody) return fromBody;
  const events = booking.events || [];
  if (events.length === 1) return events[0].id;
  return null;
}

async function recalcBookingTotalDue(bookingId) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
      extraServiceLines: true,
    },
  });
  if (!booking) return null;
  const totalDue = computeBookingTotalDueFromEvents(booking);
  const paymentStatus = paymentStatusFromAmounts(booking.amountPaid, totalDue);
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      totalDue: new Prisma.Decimal(String(totalDue)),
      paymentStatus,
    },
  });
  return totalDue;
}

async function listExtraServices(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const activeOnly =
      req.query.active_only === "1" ||
      req.query.active_only === "true" ||
      req.query.active === "true";
    const filterAnd = [{ OR: extraServiceVisibilityOrBranches(businessId, userId) }];
    if (activeOnly) filterAnd.push({ isActive: true });
    const rows = await prisma.extraService.findMany({
      where: { AND: filterAnd },
      orderBy: [{ title: "asc" }],
    });
    return successResponse(res, "OK", {
      extra_services: rows.map(serializeExtraService),
    });
  } catch (e) {
    console.error("listExtraServices:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function createExtraService(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const body = req.body || {};
    const title = String(body.title ?? "").trim();
    if (!title) {
      return errorResponse(res, "Title is required", 200, "VALIDATION_ERROR");
    }
    const pricingType = String(body.pricing_type ?? body.pricingType ?? "").toUpperCase();
    if (!PRICING_TYPES.has(pricingType)) {
      return errorResponse(res, "Invalid pricing type", 200, "VALIDATION_ERROR");
    }
    const price = Math.max(0, num(body.price));
    const row = await prisma.extraService.create({
      data: {
        businessId,
        createdByUserId: userId ?? null,
        isGlobal: deriveIsGlobal(businessId, userId),
        title,
        description: body.description ? String(body.description) : null,
        pricingType,
        price: new Prisma.Decimal(String(price)),
        isOptional: body.is_optional !== false,
        isActive: body.is_active !== false,
      },
    });
    return successResponse(res, "Extra service created", serializeExtraService(row));
  } catch (e) {
    console.error("createExtraService:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function updateExtraService(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const existing = await prisma.extraService.findFirst({
      where: { id, businessId },
    });
    if (!existing) {
      return errorResponse(res, "Extra service not found", 404, "NOT_FOUND");
    }
    const body = req.body || {};
    const data = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) {
        return errorResponse(res, "Title is required", 200, "VALIDATION_ERROR");
      }
      data.title = title;
    }
    if (body.description !== undefined) {
      data.description = body.description ? String(body.description) : null;
    }
    if (body.pricing_type !== undefined || body.pricingType !== undefined) {
      const pricingType = String(body.pricing_type ?? body.pricingType).toUpperCase();
      if (!PRICING_TYPES.has(pricingType)) {
        return errorResponse(res, "Invalid pricing type", 200, "VALIDATION_ERROR");
      }
      data.pricingType = pricingType;
    }
    if (body.price !== undefined) {
      data.price = new Prisma.Decimal(String(Math.max(0, num(body.price))));
    }
    if (body.is_optional !== undefined) data.isOptional = Boolean(body.is_optional);
    if (body.is_active !== undefined) data.isActive = Boolean(body.is_active);
    const row = await prisma.extraService.update({ where: { id }, data });
    return successResponse(res, "Extra service updated", serializeExtraService(row));
  } catch (e) {
    console.error("updateExtraService:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function deleteExtraService(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const existing = await prisma.extraService.findFirst({
      where: { id, businessId },
    });
    if (!existing) {
      return errorResponse(res, "Extra service not found", 404, "NOT_FOUND");
    }
    await prisma.extraService.update({
      where: { id },
      data: { isActive: false },
    });
    return successResponse(res, "Extra service deleted", { id });
  } catch (e) {
    console.error("deleteExtraService:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function setBookingExtraServices(req, res) {
  try {
    const businessId = req.businessId;
    const bookingId = req.params.bookingId;
    const body = req.body || {};
    const lines = Array.isArray(body.lines) ? body.lines : [];

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      include: {
        events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!booking) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }

    const resolvedEventId = resolveTargetEventId(booking, body);
    if (!resolvedEventId) {
      return errorResponse(
        res,
        "event_id is required when the booking has multiple events",
        200,
        "VALIDATION_ERROR",
      );
    }
    const targetEvent = (booking.events || []).find((e) => e.id === resolvedEventId);
    if (!targetEvent) {
      return errorResponse(res, "Event not found", 404, "NOT_FOUND");
    }

    const guestCount = Math.max(
      0,
      Number(targetEvent.guestCount) || Number(booking.guestCount) || 0,
    );

    const serviceIds = [
      ...new Set(
        lines
          .map((line) =>
            String(line.extra_service_id ?? line.extraServiceId ?? "").trim(),
          )
          .filter(Boolean),
      ),
    ];

    const servicesById = new Map();
    if (serviceIds.length > 0) {
      const services = await prisma.extraService.findMany({
        where: {
          id: { in: serviceIds },
          isActive: true,
          OR: extraServiceVisibilityOrBranches(businessId, req.user?.userId),
        },
      });
      if (services.length !== serviceIds.length) {
        return errorResponse(res, "Extra service not found", 404, "NOT_FOUND");
      }
      for (const svc of services) {
        servicesById.set(svc.id, svc);
      }
    }

    const createRows = [];
    let extrasForEvent = 0;
    for (const line of lines) {
      const extraServiceId = String(
        line.extra_service_id ?? line.extraServiceId ?? "",
      ).trim();
      if (!extraServiceId) continue;
      const svc = servicesById.get(extraServiceId);
      if (!svc) {
        return errorResponse(res, "Extra service not found", 404, "NOT_FOUND");
      }
      const quantity =
        svc.pricingType === "FIXED"
          ? 1
          : Math.max(1, parseInt(String(line.quantity ?? 1), 10) || 1);
      const catalogUnit = num(svc.price);
      const requestedUnit =
        line.unit_price != null
          ? num(line.unit_price)
          : line.unitPrice != null
            ? num(line.unitPrice)
            : catalogUnit;
      const unitPrice =
        Number.isFinite(requestedUnit) && requestedUnit >= 0
          ? requestedUnit
          : catalogUnit;
      const lineTotal = computeLineTotal(
        svc.pricingType,
        unitPrice,
        quantity,
        guestCount,
      );
      extrasForEvent += lineTotal;
      createRows.push({
        bookingId,
        eventId: resolvedEventId,
        extraServiceId,
        quantity,
        unitPriceSnapshot: new Prisma.Decimal(String(unitPrice)),
        lineTotal: new Prisma.Decimal(String(lineTotal)),
        titleSnapshot: svc.title,
        pricingTypeSnapshot: svc.pricingType,
      });
    }

    const foodTotal = deriveEventFoodSubtotal(targetEvent);
    const eventTotal = Math.max(0, foodTotal + extrasForEvent);

    await prisma.$transaction([
      prisma.bookingExtraServiceLine.deleteMany({
        where: { bookingId, eventId: resolvedEventId },
      }),
      ...(createRows.length > 0
        ? [prisma.bookingExtraServiceLine.createMany({ data: createRows })]
        : []),
      prisma.bookingEvent.update({
        where: { id: resolvedEventId },
        data: {
          eventTotal: new Prisma.Decimal(String(eventTotal)),
        },
      }),
    ]);

    const totalDue = await recalcBookingTotalDue(bookingId);

    const [eventLines, updated] = await Promise.all([
      prisma.bookingExtraServiceLine.findMany({
        where: { bookingId },
        orderBy: [{ eventId: "asc" }, { createdAt: "asc" }],
      }),
      prisma.booking.findUnique({
        where: { id: bookingId },
        select: { updatedAt: true },
      }),
    ]);
    const extraCharges = eventLines.reduce((s, l) => s + num(l.lineTotal), 0);

    return successResponse(res, "Extra services updated", {
      event_id: resolvedEventId,
      extra_service_lines: eventLines.map(serializeExtraServiceLine),
      extra_charges: extraCharges,
      event_total: eventTotal,
      total_due: num(totalDue),
      updated_at: updated?.updatedAt?.toISOString?.() ?? updated?.updatedAt ?? null,
    });
  } catch (e) {
    console.error("setBookingExtraServices:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

module.exports = {
  listExtraServices,
  createExtraService,
  updateExtraService,
  deleteExtraService,
  setBookingExtraServices,
  recalcBookingTotalDue,
  serializeExtraServiceLine,
};
