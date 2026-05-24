const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { logActivity } = require("../utils/activityLog");

function deriveMethod(row) {
  const id = String(row.razorpayPaymentId ?? "");
  if (id.startsWith("offline_")) return "offline";
  if (id.startsWith("pay_") || id.startsWith("rzp_")) return "razorpay";
  if (id) return "razorpay";
  return "other";
}

function deriveNotes(row) {
  const raw = String(row.rawWebhookEventId ?? "");
  if (raw.startsWith("admin:")) {
    return raw.slice(6).replace(/^offline:/, "");
  }
  return null;
}

function formatPayment(row) {
  const business = row.business;
  return {
    id: row.id,
    business_id: row.businessId,
    business_name: business?.name ?? "—",
    amount: Number(row.amountPaise) / 100,
    method: deriveMethod(row),
    transaction_id: row.razorpayPaymentId,
    razorpay_invoice_id: row.razorpayInvoiceId,
    status: row.status,
    notes: deriveNotes(row),
    subscription_id: row.billingSubscriptionId,
    created_at: row.createdAt.toISOString(),
  };
}

function buildWhere(query) {
  const q = String(query.q ?? "").trim();
  const status = String(query.status ?? "all").trim().toLowerCase();
  const method = String(query.method ?? "all").trim().toLowerCase();
  const from = query.from_date ? new Date(query.from_date) : null;
  const to = query.to_date ? new Date(query.to_date) : null;

  const where = {};

  if (status !== "all") {
    where.status = { contains: status, mode: "insensitive" };
  }

  if (from || to) {
    where.createdAt = {};
    if (from && !Number.isNaN(from.getTime())) where.createdAt.gte = from;
    if (to && !Number.isNaN(to.getTime())) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  if (method === "offline") {
    where.razorpayPaymentId = { startsWith: "offline_" };
  } else if (method === "razorpay") {
    where.AND = [
      { razorpayPaymentId: { not: null } },
      { NOT: { razorpayPaymentId: { startsWith: "offline_" } } },
    ];
  }

  if (q) {
    const searchOr = [
      { razorpayPaymentId: { contains: q, mode: "insensitive" } },
      { business: { name: { contains: q, mode: "insensitive" } } },
      { business: { ownerName: { contains: q, mode: "insensitive" } } },
    ];
    if (where.AND) {
      where.AND.push({ OR: searchOr });
    } else {
      where.OR = searchOr;
    }
  }

  return where;
}

async function revenueThisMonth() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const agg = await prisma.billingPaymentEvent.aggregate({
    where: {
      createdAt: { gte: start },
      status: { in: ["captured", "paid", "success"] },
    },
    _sum: { amountPaise: true },
  });
  return Number(agg._sum.amountPaise ?? BigInt(0)) / 100;
}

/** GET /api/admin/v1/payments */
exports.listPayments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;
    const where = buildWhere(req.query);

    const [total, rows, monthRevenue] = await Promise.all([
      prisma.billingPaymentEvent.count({ where }),
      prisma.billingPaymentEvent.findMany({
        where,
        include: { business: true },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      revenueThisMonth(),
    ]);

    return successResponse(res, "Payments", {
      payments: rows.map(formatPayment),
      revenue_this_month: monthRevenue,
      pagination: {
        page,
        limit,
        total,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("listPayments admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PATCH /api/admin/v1/payments/:id */
exports.updatePayment = async (req, res) => {
  try {
    const existing = await prisma.billingPaymentEvent.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return errorResponse(res, "Payment not found", 404, "NOT_FOUND");
    }

    if (req.body.status === undefined) {
      return errorResponse(res, "status is required", 422, "VALIDATION_ERROR");
    }

    const status = String(req.body.status).trim().toLowerCase();
    const allowed = new Set(["captured", "paid", "pending", "failed", "refunded"]);
    if (!allowed.has(status)) {
      return errorResponse(res, "Invalid status", 422, "VALIDATION_ERROR");
    }

    const row = await prisma.billingPaymentEvent.update({
      where: { id: existing.id },
      data: { status },
      include: { business: true },
    });

    logActivity({
      type: "payment",
      message: `Payment ${existing.id} status → ${status}`,
      actorUserId: req.user?.userId ?? null,
      meta: { payment_id: existing.id, business_id: existing.businessId },
    });

    return successResponse(res, "Payment updated", formatPayment(row));
  } catch (error) {
    console.error("updatePayment admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
