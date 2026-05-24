const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { serializeBooking } = require("./bookingController");

function num(d) {
  if (d == null) return 0;
  const n = typeof d === "number" ? d : Number(d);
  return Number.isFinite(n) ? n : 0;
}

function primaryEventAt(booking) {
  const events = booking.events || [];
  if (events.length > 0) {
    const sorted = [...events].sort(
      (a, b) => new Date(a.eventAt || 0) - new Date(b.eventAt || 0),
    );
    return sorted[0]?.eventAt ?? booking.eventAt ?? null;
  }
  return booking.eventAt ?? null;
}

function formatBookingListRow(booking) {
  const business = booking.business;
  const eventAt = primaryEventAt(booking);
  const firstEvent = (booking.events || [])[0];
  return {
    id: booking.id,
    booking_code: booking.bookingCode,
    business_id: booking.businessId,
    business_name: business?.name ?? "—",
    customer_name: booking.customerName ?? "—",
    customer_phone: booking.customerPhone,
    event_at: eventAt?.toISOString?.() ?? null,
    event_location: firstEvent?.eventLocation ?? booking.eventLocation,
    function_type: booking.functionType ?? firstEvent?.functionType,
    guest_count: booking.guestCount ?? firstEvent?.guestCount,
    status: booking.status,
    payment_status: booking.paymentStatus,
    total_due: num(booking.totalDue),
    amount_paid: num(booking.amountPaid),
    created_at: booking.createdAt.toISOString(),
    completed_at: booking.completedAt?.toISOString() ?? null,
  };
}

function buildBookingListWhere(query) {
  const q = String(query.q ?? "").trim();
  const status = String(query.status ?? "all").toUpperCase();
  const businessId = String(query.business_id ?? "").trim();
  const eventDate = String(query.event_date ?? query.date ?? "").trim();
  const fromDate = String(query.from_date ?? "").trim();
  const toDate = String(query.to_date ?? "").trim();

  const clauses = [];

  if (status !== "ALL" && ["DRAFT", "CONFIRMED", "CANCELLED"].includes(status)) {
    clauses.push({ status });
  }

  if (businessId) {
    clauses.push({ businessId });
  }

  if (eventDate) {
    const start = new Date(`${eventDate}T00:00:00.000Z`);
    const end = new Date(`${eventDate}T23:59:59.999Z`);
    if (!Number.isNaN(start.getTime())) {
      clauses.push({
        OR: [
          { eventAt: { gte: start, lte: end } },
          { events: { some: { eventAt: { gte: start, lte: end } } } },
        ],
      });
    }
  } else if (fromDate || toDate) {
    const eventRange = {};
    if (fromDate) {
      const d = new Date(fromDate);
      if (!Number.isNaN(d.getTime())) eventRange.gte = d;
    }
    if (toDate) {
      const d = new Date(toDate);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        eventRange.lte = d;
      }
    }
    if (Object.keys(eventRange).length > 0) {
      clauses.push({
        OR: [
          { eventAt: eventRange },
          { events: { some: { eventAt: eventRange } } },
        ],
      });
    }
  }

  if (q) {
    clauses.push({
      OR: [
        { bookingCode: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q } },
        { customerEmail: { contains: q, mode: "insensitive" } },
        { eventLocation: { contains: q, mode: "insensitive" } },
        { functionType: { contains: q, mode: "insensitive" } },
        { business: { name: { contains: q, mode: "insensitive" } } },
        { business: { ownerName: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

/** GET /api/admin/v1/bookings */
exports.listBookings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;
    const where = buildBookingListWhere(req.query);

    const [total, rows] = await prisma.$transaction([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        include: {
          business: { select: { id: true, name: true, ownerName: true } },
          events: {
            orderBy: [{ eventAt: "asc" }],
            take: 1,
          },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return successResponse(res, "Bookings", {
      bookings: rows.map(formatBookingListRow),
      pagination: {
        page,
        limit,
        total,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("listBookings admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** GET /api/admin/v1/bookings/:id */
exports.getBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await prisma.booking.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            ownerName: true,
            contactNumber: true,
            email: true,
          },
        },
        menuItems: true,
        extraServiceLines: true,
        events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!row) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }

    const booking = serializeBooking(row, { includePayments: true });
    return successResponse(res, "Booking", {
      booking: {
        ...booking,
        business: row.business
          ? {
              id: row.business.id,
              name: row.business.name,
              owner_name: row.business.ownerName,
              contact_number: row.business.contactNumber,
              email: row.business.email,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("getBooking admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
