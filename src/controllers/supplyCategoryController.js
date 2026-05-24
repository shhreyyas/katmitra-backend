const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");

function slugify(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "category";
}

async function ensureUniqueSlug(base, excludeId) {
  const root = slugify(base);
  for (let n = 0; n < 10000; n += 1) {
    const candidate = n === 0 ? root : `${root}-${n}`;
    const existing = await prisma.supplyItemCategory.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (!existing) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function formatCategory(row, requestedLanguage = "en") {
  return {
    id: row.id,
    name: resolveLocalizedName(row.name, requestedLanguage),
    name_i18n: row.name,
    slug: row.slug,
    sort_order: row.sortOrder,
    is_active: row.isActive,
    supply_items_count: row._count?.supplyItems ?? 0,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

exports.createSupplyCategory = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const { name, slug, sort_order, is_active } = req.body;

    const normalizedName = normalizeLocalizedName(name);
    if (!normalizedName) {
      return errorResponse(res, "name is required", 422, "VALIDATION_ERROR");
    }

    const finalSlug = await ensureUniqueSlug(
      slug != null && slug !== "" ? slug : normalizedName.en,
    );

    const row = await prisma.supplyItemCategory.create({
      data: {
        name: normalizedName,
        slug: finalSlug,
        sortOrder:
          sort_order !== undefined && Number.isFinite(Number(sort_order))
            ? Math.trunc(Number(sort_order))
            : 0,
        isActive: typeof is_active === "boolean" ? is_active : true,
      },
    });

    return successResponse(
      res,
      "Supply category created",
      formatCategory(row, requestedLanguage),
      201,
    );
  } catch (error) {
    console.error("createSupplyCategory error:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Category slug already exists", 409, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.updateSupplyCategory = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const { id } = req.params;
    const { name, slug, sort_order, is_active } = req.body;

    const existing = await prisma.supplyItemCategory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Category not found", 404, "NOT_FOUND");
    }

    const data = {};
    if (name !== undefined) {
      const normalizedName = normalizeLocalizedName(name);
      if (!normalizedName) {
        return errorResponse(res, "name must be a non-empty string", 422, "VALIDATION_ERROR");
      }
      data.name = normalizedName;
    }
    if (slug !== undefined) {
      const nextSlug =
        slug != null && String(slug).trim() !== ""
          ? await ensureUniqueSlug(slug, id)
          : await ensureUniqueSlug(
              (data.name
                ? resolveLocalizedName(data.name, "en")
                : resolveLocalizedName(existing.name, "en")) || "category",
              id,
            );
      data.slug = nextSlug;
    }
    if (sort_order !== undefined) {
      if (!Number.isFinite(Number(sort_order))) {
        return errorResponse(res, "sort_order must be a number", 422, "VALIDATION_ERROR");
      }
      data.sortOrder = Math.trunc(Number(sort_order));
    }
    if (is_active !== undefined) {
      if (typeof is_active !== "boolean") {
        return errorResponse(res, "is_active must be a boolean", 422, "VALIDATION_ERROR");
      }
      data.isActive = is_active;
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(res, "No fields to update", 422, "VALIDATION_ERROR");
    }

    const row = await prisma.supplyItemCategory.update({
      where: { id },
      data,
    });

    return successResponse(
      res,
      "Supply category updated",
      formatCategory(row, requestedLanguage),
    );
  } catch (error) {
    console.error("updateSupplyCategory error:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Category slug already exists", 409, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.deleteSupplyCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.supplyItemCategory.findUnique({
      where: { id },
      include: { _count: { select: { supplyItems: true } } },
    });
    if (!existing) {
      return errorResponse(res, "Category not found", 404, "NOT_FOUND");
    }
    if (existing._count.supplyItems > 0) {
      return errorResponse(
        res,
        "Cannot delete category with supply items",
        409,
        "CONFLICT",
        "Remove or reassign supply items first",
      );
    }

    await prisma.supplyItemCategory.delete({ where: { id } });

    return successResponse(res, "Supply category deleted", { id });
  } catch (error) {
    console.error("deleteSupplyCategory error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
