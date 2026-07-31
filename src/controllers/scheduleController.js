const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { serializeBooking } = require("./bookingController");
const { serializeQuotation } = require("./quotationController");

function queryStringParam(val) {
  if (val == null || val === "") return "";
  if (Array.isArray(val)) return String(val[0] ?? "");
  return String(val);
}

function queryNumberParam(val, fallback, opts = {}) {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n)) return fallback;
  const { min = -Infinity, max = Infinity } = opts;
  return Math.min(max, Math.max(min, n));
}

/** Normalize schedule filter from query (`IN PROGRESS` → `IN_PROGRESS`). */
function normalizeScheduleFilter(raw) {
  return String(raw ?? "ALL")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function buildBookingEventRangeClause(event_from, event_to) {
  if (!event_from && !event_to) return null;
  const eventRange = {};
  if (event_from) eventRange.gte = new Date(event_from);
  if (event_to) eventRange.lte = new Date(event_to);
  return {
    OR: [
      { eventAt: eventRange },
      {
        events: {
          some: {
            eventAt: eventRange,
          },
        },
      },
    ],
  };
}

function buildBookingSearchClause(searchQRaw) {
  if (!searchQRaw) return null;
  const ic = { contains: searchQRaw, mode: "insensitive" };
  const eventRowsOr = [
    { eventLocation: ic },
    { functionType: ic },
    { notes: ic },
  ];
  return {
    OR: [
      { customerName: ic },
      { customerPhone: ic },
      { bookingCode: ic },
      { customerEmail: ic },
      { eventLocation: ic },
      { functionType: ic },
      { notes: ic },
      {
        events: {
          some: {
            OR: eventRowsOr,
          },
        },
      },
    ],
  };
}

function buildQuotationScheduleWhere(businessId, { event_from, event_to, searchQRaw }) {
  const clauses = [{ businessId }, { status: { not: "ACCEPTED" } }];
  if (event_from || event_to) {
    const eventRange = {};
    if (event_from) eventRange.gte = new Date(event_from);
    if (event_to) eventRange.lte = new Date(event_to);
    clauses.push({
      OR: [
        { eventDate: eventRange },
        {
          AND: [{ eventDate: null }, { createdAt: eventRange }],
        },
      ],
    });
  }
  if (searchQRaw) {
    const ic = { contains: searchQRaw, mode: "insensitive" };
    clauses.push({
      OR: [{ clientName: ic }, { functionType: ic }, { clientPhone: ic }],
    });
  }
  return { AND: clauses };
}

const bookingListInclude = {
  events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
};

async function fetchQuotationsForSchedule(where) {
  const rows = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 60; page++) {
    const batch = await prisma.quotation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        menuItems: true,
        events: {
          include: { extraServiceLines: true },
          orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }],
        },
        extraServiceLines: true,
      },
    });
    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return rows;
}

function bookingStatusesForFilter(filterNorm) {
  if (filterNorm === "BOOKING_DRAFT") return ["DRAFT"];
  if (filterNorm === "QUOTATION") return [];
  if (
    filterNorm === "ALL" ||
    filterNorm === "COMPLETED" ||
    filterNorm === "CONFIRMED" ||
    filterNorm === "IN_PROGRESS" ||
    filterNorm === "PENDING" ||
    filterNorm === "AWAITING_COMPLETION"
  ) {
    if (filterNorm === "ALL") return ["DRAFT", "CONFIRMED"];
    return ["CONFIRMED"];
  }
  return ["CONFIRMED"];
}

function includeQuotationsForFilter(filterNorm) {
  return filterNorm === "ALL" || filterNorm === "QUOTATION";
}

function includeBookingsForFilter(filterNorm) {
  return filterNorm !== "QUOTATION";
}

/**
 * GET /v1/scheduleEvents — bookings + quotations for the schedule tab (single call).
 * Query: event_from, event_to (calendar range), filter (ALL|BOOKING_DRAFT|QUOTATION|…), q, limit, offset.
 */
async function listScheduleEvents(req, res) {
  try {
    const businessId = req.businessId;
    const filterNorm = normalizeScheduleFilter(req.query.filter);
    const searchQRaw = (
      queryStringParam(req.query.q) || queryStringParam(req.query.search)
    )
      .trim()
      .slice(0, 160);
    const { event_from, event_to } = req.query;

    const take = queryNumberParam(req.query.limit, 50, { min: 1, max: 200 });
    const skip = queryNumberParam(req.query.offset, 0, { min: 0, max: 100_000 });

    if (searchQRaw.length > 0) {
      const quotations = includeQuotationsForFilter(filterNorm)
        ? await fetchQuotationsForSchedule(
            buildQuotationScheduleWhere(businessId, { searchQRaw }),
          )
        : [];

      if (filterNorm === "QUOTATION") {
        const mapped = quotations.map(serializeQuotation);
        return successResponse(res, "OK", {
          bookings: [],
          quotations: mapped,
          total_bookings: 0,
          total_quotations: mapped.length,
          limit: take,
          offset: skip,
          has_more: false,
        });
      }

      const statuses = bookingStatusesForFilter(filterNorm);
      const bookingClauses = [{ businessId }];
      if (statuses.length === 1) {
        bookingClauses.push({ status: statuses[0] });
      } else if (statuses.length > 1) {
        bookingClauses.push({ status: { in: statuses } });
      }
      const searchClause = buildBookingSearchClause(searchQRaw);
      if (searchClause) bookingClauses.push(searchClause);
      const where = { AND: bookingClauses };

      const [rows, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take,
          skip,
          include: bookingListInclude,
        }),
        prisma.booking.count({ where }),
      ]);

      const has_more = skip + rows.length < total;
      return successResponse(res, "OK", {
        bookings: rows.map((b) => serializeBooking(b, { includePayments: false })),
        quotations: quotations.map(serializeQuotation),
        total_bookings: total,
        total_quotations: quotations.length,
        limit: take,
        offset: skip,
        has_more,
      });
    }

    const rangeClause = buildBookingEventRangeClause(event_from, event_to);
    const quotations = includeQuotationsForFilter(filterNorm)
      ? await fetchQuotationsForSchedule(
          buildQuotationScheduleWhere(businessId, {
            event_from,
            event_to,
          }),
        )
      : [];

    let bookings = [];
    let totalBookings = 0;
    if (includeBookingsForFilter(filterNorm)) {
      const statuses = bookingStatusesForFilter(filterNorm);
      const bookingClauses = [{ businessId }];
      if (statuses.length === 1) {
        bookingClauses.push({ status: statuses[0] });
      } else if (statuses.length > 1) {
        bookingClauses.push({ status: { in: statuses } });
      }
      if (rangeClause) bookingClauses.push(rangeClause);
      const where = { AND: bookingClauses };
      const [rows, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take,
          skip,
          include: bookingListInclude,
        }),
        prisma.booking.count({ where }),
      ]);
      bookings = rows;
      totalBookings = total;
    }

    return successResponse(res, "OK", {
      bookings: bookings.map((b) => serializeBooking(b, { includePayments: false })),
      quotations: quotations.map(serializeQuotation),
      total_bookings: totalBookings,
      total_quotations: quotations.length,
      limit: take,
      offset: skip,
      has_more: skip + bookings.length < totalBookings,
    });
  } catch (e) {
    console.error("listScheduleEvents:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

module.exports = {
  listScheduleEvents,
};
