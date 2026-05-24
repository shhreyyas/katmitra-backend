const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");

const PRICING_TYPES = new Set(["FIXED", "PER_UNIT", "PER_GUEST"]);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function deriveIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

function resolveAdminScope(body) {
  const scope = String(body.scope ?? body.availability ?? "global")
    .trim()
    .toLowerCase();
  if (scope === "business" || scope === "business_only") {
    const businessId = String(body.business_id ?? body.businessId ?? "").trim();
    if (!businessId) {
      return { error: "business_id is required when scope is business" };
    }
    return { businessId, isBusinessScoped: true };
  }
  return { businessId: null, isBusinessScoped: false };
}

function formatAdminExtraService(row) {
  const isGlobal = deriveIsGlobal(row.businessId, row.createdByUserId);
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    pricing_type: row.pricingType,
    price: num(row.price),
    is_optional: row.isOptional,
    is_active: row.isActive,
    business_id: row.businessId,
    business_name: row.business?.name ?? null,
    is_global: isGlobal,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** GET /api/admin/v1/extra-services */
exports.listExtraServices = async (req, res) => {
  try {
    const scope = String(req.query.scope ?? "all").toLowerCase();
    const businessId = String(req.query.business_id ?? "").trim();
    const pricingType = String(req.query.pricing_type ?? "").toUpperCase();
    const status = String(req.query.status ?? "all").toLowerCase();
    const search = String(req.query.q ?? req.query.search ?? "").trim();

    const where = {};
    if (scope === "global") {
      where.OR = [{ businessId: null }, { isGlobal: true }];
    } else if (scope === "business") {
      where.businessId = { not: null };
      where.isGlobal = false;
      if (businessId) where.businessId = businessId;
    }
    if (PRICING_TYPES.has(pricingType)) where.pricingType = pricingType;
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    let rows = await prisma.extraService.findMany({
      where,
      include: { business: { select: { id: true, name: true } } },
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
    });

    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) => {
        const title = String(r.title ?? "").toLowerCase();
        const desc = String(r.description ?? "").toLowerCase();
        return title.includes(s) || desc.includes(s);
      });
    }

    return successResponse(res, "Extra services", {
      items: rows.map(formatAdminExtraService),
    });
  } catch (error) {
    console.error("listExtraServices admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** POST /api/admin/v1/extra-services */
exports.createExtraService = async (req, res) => {
  try {
    const adminUserId = req.user.userId;
    const scopeResult = resolveAdminScope(req.body);
    if (scopeResult.error) {
      return errorResponse(res, scopeResult.error, 422, "VALIDATION_ERROR");
    }
    const { businessId } = scopeResult;

    const title = String(req.body.title ?? "").trim();
    if (!title) {
      return errorResponse(res, "title is required", 422, "VALIDATION_ERROR");
    }

    const pricingType = String(
      req.body.pricing_type ?? req.body.pricingType ?? "",
    ).toUpperCase();
    if (!PRICING_TYPES.has(pricingType)) {
      return errorResponse(
        res,
        "pricing_type must be FIXED, PER_UNIT, or PER_GUEST",
        422,
        "VALIDATION_ERROR",
      );
    }

    const price = Math.max(0, num(req.body.price));
    if (businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (!biz) {
        return errorResponse(res, "Business not found", 404, "NOT_FOUND");
      }
    }

    const row = await prisma.extraService.create({
      data: {
        businessId,
        createdByUserId: adminUserId,
        isGlobal: deriveIsGlobal(businessId, adminUserId),
        title,
        description:
          typeof req.body.description === "string" && req.body.description.trim()
            ? req.body.description.trim()
            : null,
        pricingType,
        price: new Prisma.Decimal(String(price)),
        isOptional: req.body.is_optional !== false,
        isActive: req.body.is_active !== false,
      },
      include: { business: { select: { id: true, name: true } } },
    });

    return successResponse(
      res,
      "Extra service created",
      formatAdminExtraService(row),
      201,
    );
  } catch (error) {
    console.error("createExtraService admin:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

/** PUT /api/admin/v1/extra-services/:id */
exports.updateExtraService = async (req, res) => {
  try {
    const adminUserId = req.user.userId;
    const { id } = req.params;

    const existing = await prisma.extraService.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Extra service not found", 404, "NOT_FOUND");
    }

    const updates = {};

    if (req.body.scope !== undefined || req.body.business_id !== undefined) {
      const scopeResult = resolveAdminScope({
        scope: req.body.scope ?? (req.body.business_id ? "business" : "global"),
        business_id: req.body.business_id,
      });
      if (scopeResult.error) {
        return errorResponse(res, scopeResult.error, 422, "VALIDATION_ERROR");
      }
      updates.businessId = scopeResult.businessId;
      updates.isGlobal = deriveIsGlobal(scopeResult.businessId, adminUserId);
      updates.createdByUserId = adminUserId;
    }

    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) {
        return errorResponse(res, "title is required", 422, "VALIDATION_ERROR");
      }
      updates.title = title;
    }
    if (req.body.description !== undefined) {
      updates.description =
        typeof req.body.description === "string" && req.body.description.trim()
          ? req.body.description.trim()
          : null;
    }
    if (req.body.pricing_type !== undefined || req.body.pricingType !== undefined) {
      const pricingType = String(
        req.body.pricing_type ?? req.body.pricingType,
      ).toUpperCase();
      if (!PRICING_TYPES.has(pricingType)) {
        return errorResponse(res, "Invalid pricing_type", 422, "VALIDATION_ERROR");
      }
      updates.pricingType = pricingType;
    }
    if (req.body.price !== undefined) {
      updates.price = new Prisma.Decimal(String(Math.max(0, num(req.body.price))));
    }
    if (req.body.is_optional !== undefined) {
      updates.isOptional = Boolean(req.body.is_optional);
    }
    if (req.body.is_active !== undefined) {
      updates.isActive = Boolean(req.body.is_active);
    }

    const row = await prisma.extraService.update({
      where: { id },
      data: updates,
      include: { business: { select: { id: true, name: true } } },
    });

    return successResponse(res, "Extra service updated", formatAdminExtraService(row));
  } catch (error) {
    console.error("updateExtraService admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** DELETE /api/admin/v1/extra-services/:id — soft delete */
exports.deleteExtraService = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.extraService.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Extra service not found", 404, "NOT_FOUND");
    }
    await prisma.extraService.update({
      where: { id },
      data: { isActive: false },
    });
    return successResponse(res, "Extra service deactivated", { id });
  } catch (error) {
    console.error("deleteExtraService admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
