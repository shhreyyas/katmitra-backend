const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { serializeQuotation } = require("./quotationController");

function num(d) {
  if (d == null) return 0;
  const n = typeof d === "number" ? d : Number(d);
  return Number.isFinite(n) ? n : 0;
}

function formatQuotationListRow(q) {
  const business = q.business;
  return {
    id: q.id,
    business_id: q.businessId,
    business_name: business?.name ?? "—",
    client_name: q.clientName,
    client_phone: q.clientPhone,
    function_type: q.functionType,
    event_date: q.eventDate?.toISOString?.() ?? null,
    guest_count: q.guestCount,
    status: q.status,
    total: num(q.total),
    created_at: q.createdAt.toISOString(),
    updated_at: q.updatedAt.toISOString(),
  };
}

function buildQuotationListWhere(query) {
  const q = String(query.q ?? "").trim();
  const status = String(query.status ?? "all").toUpperCase();
  const businessId = String(query.business_id ?? "").trim();
  const eventDate = String(query.event_date ?? query.date ?? "").trim();
  const fromDate = String(query.from_date ?? "").trim();
  const toDate = String(query.to_date ?? "").trim();

  const clauses = [];

  if (status !== "ALL" && ["DRAFT", "SALE", "SENT", "ACCEPTED"].includes(status)) {
    clauses.push({ status });
  }

  if (businessId) {
    clauses.push({ businessId });
  }

  if (eventDate) {
    const start = new Date(`${eventDate}T00:00:00.000Z`);
    const end = new Date(`${eventDate}T23:59:59.999Z`);
    if (!Number.isNaN(start.getTime())) {
      clauses.push({ eventDate: { gte: start, lte: end } });
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
      clauses.push({ eventDate: eventRange });
    }
  }

  if (q) {
    clauses.push({
      OR: [
        { clientName: { contains: q, mode: "insensitive" } },
        { clientPhone: { contains: q } },
        { functionType: { contains: q, mode: "insensitive" } },
        { business: { name: { contains: q, mode: "insensitive" } } },
        { business: { ownerName: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

/** GET /api/admin/v1/quotations */
exports.listQuotations = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;
    const where = buildQuotationListWhere(req.query);

    const [total, rows] = await prisma.$transaction([
      prisma.quotation.count({ where }),
      prisma.quotation.findMany({
        where,
        include: {
          business: { select: { id: true, name: true, ownerName: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return successResponse(res, "Quotations", {
      quotations: rows.map(formatQuotationListRow),
      pagination: {
        page,
        limit,
        total,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("listQuotations admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** GET /api/admin/v1/quotations/:id */
exports.getQuotation = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await prisma.quotation.findUnique({
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
        events: {
          include: { extraServiceLines: true },
          orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }],
        },
        extraServiceLines: true,
      },
    });

    if (!row) {
      return errorResponse(res, "Quotation not found", 404, "NOT_FOUND");
    }

    const quotation = serializeQuotation(row);
    return successResponse(res, "Quotation", {
      quotation: {
        ...quotation,
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
    console.error("getQuotation admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
