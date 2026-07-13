const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");

const VALID_STATUSES = new Set(["open", "resolved"]);

function formatSupportMessage(row) {
  const user = row.user;
  const business = user?.business;
  return {
    id: row.id,
    email: row.email,
    customer_name: row.customerName,
    phone: row.phone,
    description: row.description,
    status: row.status,
    user_id: row.userId,
    user_name: user?.name ?? null,
    business_id: business?.id ?? null,
    business_name: row.businessName ?? business?.name ?? null,
    address: row.address ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function buildSupportListWhere(query) {
  const q = String(query.q ?? "").trim();
  const status = String(query.status ?? "all").toLowerCase();

  const clauses = [];
  if (status !== "all" && VALID_STATUSES.has(status)) {
    clauses.push({ status });
  }
  if (q) {
    clauses.push({
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { businessName: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { business: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  return clauses.length > 0 ? { AND: clauses } : {};
}

const supportInclude = {
  user: {
    select: {
      id: true,
      name: true,
      business: { select: { id: true, name: true } },
    },
  },
};

/** GET /api/admin/v1/support */
exports.listSupportMessages = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;
    const where = buildSupportListWhere(req.query);

    const [total, rows] = await prisma.$transaction([
      prisma.contactMessage.count({ where }),
      prisma.contactMessage.findMany({
        where,
        include: supportInclude,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return successResponse(res, "Support messages", {
      support_messages: rows.map(formatSupportMessage),
      pagination: {
        page,
        limit,
        total,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("listSupportMessages admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** GET /api/admin/v1/support/:id */
exports.getSupportMessage = async (req, res) => {
  try {
    const row = await prisma.contactMessage.findUnique({
      where: { id: req.params.id },
      include: supportInclude,
    });
    if (!row) {
      return errorResponse(res, "Support message not found", 404, "NOT_FOUND");
    }
    return successResponse(res, "Support message", {
      support_message: formatSupportMessage(row),
    });
  } catch (error) {
    console.error("getSupportMessage admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PATCH /api/admin/v1/support/:id */
exports.updateSupportMessage = async (req, res) => {
  try {
    const status = String(req.body?.status ?? "").toLowerCase();
    if (!VALID_STATUSES.has(status)) {
      return errorResponse(
        res,
        "status must be open or resolved",
        422,
        "VALIDATION_ERROR",
      );
    }

    const existing = await prisma.contactMessage.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return errorResponse(res, "Support message not found", 404, "NOT_FOUND");
    }

    const row = await prisma.contactMessage.update({
      where: { id: req.params.id },
      data: { status },
      include: supportInclude,
    });

    return successResponse(res, "Support message updated", {
      support_message: formatSupportMessage(row),
    });
  } catch (error) {
    console.error("updateSupportMessage admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
