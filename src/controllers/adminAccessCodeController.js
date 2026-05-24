const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { logActivity } = require("../utils/activityLog");

const VALID_PLANS = new Set(["1M", "6M", "12M"]);
const VALID_STATUSES = new Set(["unused", "used", "expired", "disabled"]);

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function formatAccessCode(row) {
  const user = row.assignedUser;
  const businessName = user?.business?.name ?? null;
  return {
    id: row.id,
    code: row.code,
    plan_type: row.planType,
    status: row.status,
    assigned_user_id: row.assignedUserId,
    assigned_user_name: user?.name ?? null,
    assigned_business_name: businessName,
    used_at: row.usedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** GET /api/admin/v1/access-codes */
exports.listAccessCodes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50),
    );
    const skip = (page - 1) * limit;
    const status = String(req.query.status ?? "all").trim().toLowerCase();
    const plan = String(req.query.plan ?? "all").trim().toUpperCase();
    const q = String(req.query.q ?? "").trim();

    const where = {};
    if (status !== "all" && VALID_STATUSES.has(status)) {
      where.status = status;
    }
    if (plan !== "ALL" && VALID_PLANS.has(plan)) {
      where.planType = plan;
    }
    if (q) {
      where.OR = [
        { code: { contains: q } },
        { assignedUser: { name: { contains: q, mode: "insensitive" } } },
        { assignedUser: { email: { contains: q, mode: "insensitive" } } },
        { assignedUser: { business: { name: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const [total, rows] = await prisma.$transaction([
      prisma.accessCode.count({ where }),
      prisma.accessCode.findMany({
        where,
        include: {
          assignedUser: {
            include: { business: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return successResponse(res, "Access codes", {
      access_codes: rows.map(formatAccessCode),
      pagination: {
        page,
        limit,
        total,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("listAccessCodes admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** POST /api/admin/v1/access-codes */
exports.createAccessCodes = async (req, res) => {
  try {
    const planType = String(req.body.plan_type ?? req.body.planType ?? "")
      .trim()
      .toUpperCase();
    const count = Math.min(
      100,
      Math.max(1, parseInt(String(req.body.count ?? 1), 10) || 1),
    );

    if (!VALID_PLANS.has(planType)) {
      return errorResponse(
        res,
        "plan_type must be 1M, 6M, or 12M",
        422,
        "VALIDATION_ERROR",
      );
    }

    const created = [];
    for (let i = 0; i < count; i += 1) {
      let code = generateCode();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const exists = await prisma.accessCode.findUnique({ where: { code } });
        if (!exists) break;
        code = generateCode();
      }
      const row = await prisma.accessCode.create({
        data: { code, planType, status: "unused" },
        include: {
          assignedUser: {
            include: { business: { select: { id: true, name: true } } },
          },
        },
      });
      created.push(formatAccessCode(row));
    }

    logActivity({
      type: "access_code",
      message: `Generated ${created.length} ${planType} access code(s)`,
      actorUserId: req.user?.userId ?? null,
      meta: { plan_type: planType, count: created.length },
    });

    return successResponse(
      res,
      `Generated ${created.length} access code(s)`,
      { access_codes: created },
      201,
    );
  } catch (error) {
    console.error("createAccessCodes admin:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Duplicate code, retry", 409, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PATCH /api/admin/v1/access-codes/:id */
exports.updateAccessCode = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.accessCode.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Access code not found", 404, "NOT_FOUND");
    }

    const status = String(req.body.status ?? "").trim().toLowerCase();
    if (!VALID_STATUSES.has(status)) {
      return errorResponse(res, "Invalid status", 422, "VALIDATION_ERROR");
    }

    const row = await prisma.accessCode.update({
      where: { id },
      data: { status },
      include: {
        assignedUser: {
          include: { business: { select: { id: true, name: true } } },
        },
      },
    });

    return successResponse(res, "Access code updated", formatAccessCode(row));
  } catch (error) {
    console.error("updateAccessCode admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
