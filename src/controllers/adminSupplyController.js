const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");

const VALID_TYPES = new Set(["INGREDIENT", "UTENSIL"]);

function deriveIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

async function loadSupplyCategoryBySlug(slug) {
  return prisma.supplyItemCategory.findFirst({
    where: { slug },
    select: { slug: true, name: true, isActive: true },
  });
}

function formatAdminSupplyItem(row, language = "en") {
  const isGlobal = deriveIsGlobal(row.businessId, row.createdByUserId);
  return {
    id: row.id,
    name: resolveLocalizedName(row.name, language),
    name_i18n: row.name,
    type: row.type,
    category_slug: row.categorySlug,
    category_name: row.category
      ? resolveLocalizedName(row.category.name, language)
      : row.categorySlug,
    business_id: row.businessId,
    business_name: row.business?.name ?? null,
    is_global: isGlobal,
    unit_options: row.unitOptions ?? [],
    default_unit: row.defaultUnit,
    available_count: row.availableCount ?? null,
    damaged_count: row.type === "UTENSIL" ? Math.max(0, row.damagedCount ?? 0) : 0,
    photo_url: row.photoUrl ?? null,
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
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

function parseUnitFields(body) {
  const unitOptions = Array.isArray(body.unit_options)
    ? body.unit_options
        .map((u) => String(u ?? "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  const defaultUnit = String(body.default_unit || "").trim().toLowerCase();
  if (unitOptions.length === 0) {
    return { error: "unit_options must have at least one unit" };
  }
  if (!defaultUnit || !unitOptions.includes(defaultUnit)) {
    return { error: "default_unit must be one of unit_options" };
  }
  return { unitOptions, defaultUnit };
}

/** GET /api/admin/v1/supply-items */
exports.listSupplyItems = async (req, res) => {
  try {
    const language = getRequestedLanguage(req);
    const scope = String(req.query.scope ?? "all").toLowerCase();
    const businessId = String(req.query.business_id ?? "").trim();
    const categorySlug = String(req.query.category_slug ?? "").trim();
    const typeRaw = String(req.query.type ?? "").toUpperCase();
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
    if (categorySlug) where.categorySlug = categorySlug;
    if (VALID_TYPES.has(typeRaw)) where.type = typeRaw;
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    let rows = await prisma.supplyItem.findMany({
      where,
      include: {
        category: true,
        business: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
    });

    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) => {
        const en = String(r.name?.en ?? "").toLowerCase();
        const hi = String(r.name?.hi ?? "").toLowerCase();
        const gu = String(r.name?.gu ?? "").toLowerCase();
        return en.includes(s) || hi.includes(s) || gu.includes(s);
      });
    }

    return successResponse(res, "Supply items", {
      items: rows.map((r) => formatAdminSupplyItem(r, language)),
    });
  } catch (error) {
    console.error("listSupplyItems admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** POST /api/admin/v1/supply-items */
exports.createSupplyItem = async (req, res) => {
  try {
    const language = getRequestedLanguage(req);
    const adminUserId = req.user.userId;
    const scopeResult = resolveAdminScope(req.body);
    if (scopeResult.error) {
      return errorResponse(res, scopeResult.error, 422, "VALIDATION_ERROR");
    }
    const { businessId } = scopeResult;

    const type = String(req.body.type || "").toUpperCase();
    if (!VALID_TYPES.has(type)) {
      return errorResponse(res, "type must be INGREDIENT or UTENSIL", 422, "VALIDATION_ERROR");
    }

    const categorySlug = String(req.body.category_slug ?? "")
      .trim()
      .toLowerCase();
    if (!categorySlug) {
      return errorResponse(res, "category_slug is required", 422, "VALIDATION_ERROR");
    }

    const names = normalizeLocalizedName(req.body.name);
    if (!names) {
      return errorResponse(res, "name (en, hi, gu) is required", 422, "VALIDATION_ERROR");
    }

    const unitResult = parseUnitFields(req.body);
    if (unitResult.error) {
      return errorResponse(res, unitResult.error, 422, "VALIDATION_ERROR");
    }

    const categoryRow = await loadSupplyCategoryBySlug(categorySlug);
    if (!categoryRow) {
      return errorResponse(res, "Invalid category_slug", 422, "VALIDATION_ERROR");
    }

    if (businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (!biz) {
        return errorResponse(res, "Business not found", 404, "NOT_FOUND");
      }
    }

    const availableCount =
      req.body.available_count == null
        ? null
        : Math.max(0, parseInt(String(req.body.available_count), 10) || 0);
    const damagedCount =
      type === "UTENSIL"
        ? Math.max(0, parseInt(String(req.body.damaged_count ?? 0), 10) || 0)
        : 0;
    if (availableCount != null && damagedCount > availableCount) {
      return errorResponse(
        res,
        "damaged_count cannot exceed available_count",
        422,
        "VALIDATION_ERROR",
      );
    }

    const row = await prisma.supplyItem.create({
      data: {
        businessId,
        createdByUserId: adminUserId,
        isGlobal: deriveIsGlobal(businessId, adminUserId),
        type,
        categorySlug: categoryRow.slug,
        name: names,
        unitOptions: unitResult.unitOptions,
        defaultUnit: unitResult.defaultUnit,
        availableCount,
        damagedCount,
        photoUrl:
          typeof req.body.photo_url === "string" && req.body.photo_url.trim()
            ? req.body.photo_url.trim()
            : null,
        isActive: typeof req.body.is_active === "boolean" ? req.body.is_active : true,
      },
      include: {
        category: true,
        business: { select: { id: true, name: true } },
      },
    });

    return successResponse(
      res,
      "Supply item created",
      formatAdminSupplyItem(row, language),
      201,
    );
  } catch (error) {
    console.error("createSupplyItem admin:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

/** PUT /api/admin/v1/supply-items/:id */
exports.updateSupplyItem = async (req, res) => {
  try {
    const language = getRequestedLanguage(req);
    const adminUserId = req.user.userId;
    const { id } = req.params;

    const existing = await prisma.supplyItem.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Supply item not found", 404, "NOT_FOUND");
    }

    const updates = {};

    if (
      req.body.scope !== undefined ||
      req.body.business_id !== undefined
    ) {
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

    if (req.body.name !== undefined) {
      const names = normalizeLocalizedName(req.body.name);
      if (!names) {
        return errorResponse(res, "Invalid name", 422, "VALIDATION_ERROR");
      }
      updates.name = names;
    }

    if (req.body.type !== undefined) {
      const type = String(req.body.type).toUpperCase();
      if (!VALID_TYPES.has(type)) {
        return errorResponse(res, "Invalid type", 422, "VALIDATION_ERROR");
      }
      updates.type = type;
    }

    if (req.body.category_slug !== undefined) {
      const slug = String(req.body.category_slug).trim().toLowerCase();
      const categoryRow = await loadSupplyCategoryBySlug(slug);
      if (!categoryRow) {
        return errorResponse(res, "Invalid category", 422, "VALIDATION_ERROR");
      }
      updates.categorySlug = slug;
    }

    if (req.body.unit_options !== undefined || req.body.default_unit !== undefined) {
      const unitResult = parseUnitFields({
        unit_options: req.body.unit_options ?? existing.unitOptions,
        default_unit: req.body.default_unit ?? existing.defaultUnit,
      });
      if (unitResult.error) {
        return errorResponse(res, unitResult.error, 422, "VALIDATION_ERROR");
      }
      updates.unitOptions = unitResult.unitOptions;
      updates.defaultUnit = unitResult.defaultUnit;
    }

    const itemType = updates.type ?? existing.type;

    if (req.body.available_count !== undefined) {
      updates.availableCount =
        req.body.available_count == null
          ? null
          : Math.max(0, parseInt(String(req.body.available_count), 10) || 0);
    }
    if (req.body.damaged_count !== undefined && itemType === "UTENSIL") {
      updates.damagedCount = Math.max(
        0,
        parseInt(String(req.body.damaged_count), 10) || 0,
      );
    }

    if (req.body.photo_url !== undefined) {
      updates.photoUrl =
        typeof req.body.photo_url === "string" && req.body.photo_url.trim()
          ? req.body.photo_url.trim()
          : null;
    }

    if (req.body.is_active !== undefined) {
      if (typeof req.body.is_active !== "boolean") {
        return errorResponse(res, "is_active must be boolean", 422, "VALIDATION_ERROR");
      }
      updates.isActive = req.body.is_active;
    }

    const finalAvailable =
      updates.availableCount !== undefined
        ? updates.availableCount
        : existing.availableCount;
    const finalDamaged =
      updates.damagedCount !== undefined
        ? updates.damagedCount
        : existing.damagedCount ?? 0;
    if (
      itemType === "UTENSIL" &&
      finalAvailable != null &&
      finalDamaged > finalAvailable
    ) {
      return errorResponse(
        res,
        "damaged_count cannot exceed available_count",
        422,
        "VALIDATION_ERROR",
      );
    }

    const row = await prisma.supplyItem.update({
      where: { id },
      data: updates,
      include: {
        category: true,
        business: { select: { id: true, name: true } },
      },
    });

    return successResponse(
      res,
      "Supply item updated",
      formatAdminSupplyItem(row, language),
    );
  } catch (error) {
    console.error("updateSupplyItem admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** DELETE /api/admin/v1/supply-items/:id — soft delete */
exports.deleteSupplyItem = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.supplyItem.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Supply item not found", 404, "NOT_FOUND");
    }
    await prisma.supplyItem.update({
      where: { id },
      data: { isActive: false },
    });
    return successResponse(res, "Supply item deleted", { id });
  } catch (error) {
    console.error("deleteSupplyItem admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
