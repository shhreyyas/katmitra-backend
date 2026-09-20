const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");
const { apiMessage } = require("../utils/apiMessages");

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
    const existing = await prisma.menuCategory.findFirst({
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
    slug: row.slug,
    sort_order: row.sortOrder,
    is_active: row.isActive,
    is_global: row.isGlobal,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Public list for the app: active categories only, ordered. */
exports.getCategory = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const rows = await prisma.menuCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    });

    return successResponse(
      res,
      "Categories fetched successfully",
      { categories: rows.map((row) => formatCategory(row, requestedLanguage)) },
      200,
    );
  } catch (error) {
    console.error("getCategory error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.createCategory = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const { name, slug, sort_order, is_active } = req.body;

    const normalizedName = normalizeLocalizedName(name);
    if (!normalizedName) {
      return errorResponse(res, "name is required", 200, "VALIDATION_ERROR");
    }

    const finalSlug = await ensureUniqueSlug(
      slug != null && slug !== "" ? slug : normalizedName.en,
    );

    const row = await prisma.menuCategory.create({
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
      "Category created successfully",
      formatCategory(row, requestedLanguage),
      200,
    );
  } catch (error) {
    console.error("createCategory error:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Category name or slug already exists", 200, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const { id } = req.params;
    const { name, slug, sort_order, is_active } = req.body;

    const existing = await prisma.menuCategory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Category not found", 404, "NOT_FOUND");
    }

    const data = {};
    if (name !== undefined) {
      const normalizedName = normalizeLocalizedName(name);
      if (!normalizedName) {
        return errorResponse(res, "name must be a non-empty string", 200, "VALIDATION_ERROR");
      }
      data.name = normalizedName;
    }
    if (slug !== undefined) {
      const nextSlug =
        slug != null && String(slug).trim() !== ""
          ? await ensureUniqueSlug(slug, id)
          : await ensureUniqueSlug(
              (data.name ? resolveLocalizedName(data.name, "en") : resolveLocalizedName(existing.name, "en")) || "category",
              id,
            );
      data.slug = nextSlug;
    }
    if (sort_order !== undefined) {
      if (!Number.isFinite(Number(sort_order))) {
        return errorResponse(res, "sort_order must be a number", 200, "VALIDATION_ERROR");
      }
      data.sortOrder = Math.trunc(Number(sort_order));
    }
    if (is_active !== undefined) {
      if (typeof is_active !== "boolean") {
        return errorResponse(res, "is_active must be a boolean", 200, "VALIDATION_ERROR");
      }
      data.isActive = is_active;
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(res, "No fields to update", 200, "VALIDATION_ERROR");
    }

    const row = await prisma.menuCategory.update({
      where: { id },
      data,
    });

    return successResponse(
      res,
      "Category updated successfully",
      formatCategory(row, requestedLanguage),
      200,
    );
  } catch (error) {
    console.error("updateCategory error:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Category name or slug already exists", 200, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * Business-scoped list for the app: global (admin) categories merged with
 * this business's own private categories. Visible business-wide — any user
 * of the business, not just whoever created a given private category.
 */
exports.listBusinessCategories = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;

    const rows = await prisma.menuCategory.findMany({
      where: {
        isActive: true,
        OR: [{ isGlobal: true }, { businessId }],
      },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    });

    return successResponse(
      res,
      "Categories fetched successfully",
      { categories: rows.map((row) => formatCategory(row, requestedLanguage)) },
      200,
    );
  } catch (error) {
    console.error("listBusinessCategories error:", error.message);
    return errorResponse(
      res,
      apiMessage("category.serverError", getRequestedLanguage(req)),
      500,
      "ERROR",
    );
  }
};

/**
 * Business-scoped create: a regular authenticated business user (not admin)
 * adds their own private category, visible business-wide. Slug uniqueness
 * still goes through ensureUniqueSlug, which scans the whole table (global
 * and every business's rows), so it can't collide with anything.
 */
exports.createBusinessCategory = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;
    const userId = req.user.userId;
    const { name } = req.body;

    const normalizedName = normalizeLocalizedName(name);
    if (!normalizedName) {
      return errorResponse(
        res,
        apiMessage("category.nameRequired", requestedLanguage),
        200,
        "VALIDATION_ERROR",
      );
    }

    // Guard against a near-duplicate of a category already visible to this
    // business (global or its own) — case-insensitive on the resolved
    // display name, so "Starters" and "starters" don't both end up in the
    // picker, and a business can't shadow an existing global category name.
    const visibleRows = await prisma.menuCategory.findMany({
      where: { isActive: true, OR: [{ isGlobal: true }, { businessId }] },
      select: { id: true, name: true, slug: true, sortOrder: true },
    });
    const requestedLower = resolveLocalizedName(normalizedName, requestedLanguage)
      .trim()
      .toLowerCase();
    const dup = visibleRows.find(
      (r) => resolveLocalizedName(r.name, requestedLanguage).trim().toLowerCase() === requestedLower,
    );
    if (dup) {
      return errorResponse(
        res,
        apiMessage("category.duplicate", requestedLanguage),
        200,
        "DUPLICATE",
        apiMessage("category.duplicateDetail", requestedLanguage),
      );
    }

    const finalSlug = await ensureUniqueSlug(normalizedName.en);

    // Append after everything currently visible to this business, so a new
    // custom category doesn't jump ahead of admin's curated ordering.
    const maxSortOrder = visibleRows.reduce(
      (max, r) => Math.max(max, Number(r.sortOrder) || 0),
      0,
    );

    const row = await prisma.menuCategory.create({
      data: {
        name: normalizedName,
        slug: finalSlug,
        sortOrder: maxSortOrder + 1,
        isActive: true,
        businessId,
        createdByUserId: userId,
        isGlobal: false,
      },
    });

    return successResponse(
      res,
      "Category created successfully",
      formatCategory(row, requestedLanguage),
      201,
    );
  } catch (error) {
    console.error("createBusinessCategory error:", error.message);
    const language = getRequestedLanguage(req);
    if (error.code === "P2002") {
      return errorResponse(res, apiMessage("category.slugConflict", language), 200, "DUPLICATE");
    }
    return errorResponse(res, apiMessage("category.serverError", language), 500, "ERROR");
  }
};

/**
 * Business-scoped rename: a business can only edit its own private
 * categories (never a global one, never another business's). Slug is never
 * touched here — MenuItem.categorySlug points at it, so changing it would
 * silently reassign every item using this category.
 */
exports.updateBusinessCategory = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;
    const { id } = req.params;
    const { name } = req.body;

    const existing = await prisma.menuCategory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, apiMessage("category.notFound", requestedLanguage), 404, "NOT_FOUND");
    }
    if (existing.isGlobal || existing.businessId !== businessId) {
      return errorResponse(
        res,
        apiMessage("category.globalReadOnly", requestedLanguage),
        403,
        "FORBIDDEN",
      );
    }

    const normalizedName = normalizeLocalizedName(name);
    if (!normalizedName) {
      return errorResponse(
        res,
        apiMessage("category.nameRequired", requestedLanguage),
        200,
        "VALIDATION_ERROR",
      );
    }

    const visibleRows = await prisma.menuCategory.findMany({
      where: { isActive: true, OR: [{ isGlobal: true }, { businessId }] },
      select: { id: true, name: true },
    });
    const requestedLower = resolveLocalizedName(normalizedName, requestedLanguage).trim().toLowerCase();
    const dup = visibleRows.find(
      (r) =>
        r.id !== id &&
        resolveLocalizedName(r.name, requestedLanguage).trim().toLowerCase() === requestedLower,
    );
    if (dup) {
      return errorResponse(
        res,
        apiMessage("category.duplicate", requestedLanguage),
        200,
        "DUPLICATE",
        apiMessage("category.duplicateDetail", requestedLanguage),
      );
    }

    const row = await prisma.menuCategory.update({
      where: { id },
      data: { name: normalizedName },
    });

    return successResponse(res, "Category updated successfully", formatCategory(row, requestedLanguage), 200);
  } catch (error) {
    console.error("updateBusinessCategory error:", error.message);
    const language = getRequestedLanguage(req);
    return errorResponse(res, apiMessage("category.serverError", language), 500, "ERROR");
  }
};

/**
 * Business-scoped delete: same ownership rule as update. Refuses to delete
 * a category still referenced by any menu item (MenuItem.categorySlug has
 * no cascade — a business must move/delete those items first).
 */
exports.deleteBusinessCategory = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;
    const { id } = req.params;

    const existing = await prisma.menuCategory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, apiMessage("category.notFound", requestedLanguage), 404, "NOT_FOUND");
    }
    if (existing.isGlobal || existing.businessId !== businessId) {
      return errorResponse(
        res,
        apiMessage("category.globalReadOnly", requestedLanguage),
        403,
        "FORBIDDEN",
      );
    }

    const usedByCount = await prisma.menuItem.count({ where: { categorySlug: existing.slug } });
    if (usedByCount > 0) {
      return errorResponse(res, apiMessage("category.inUse", requestedLanguage), 422, "CATEGORY_IN_USE");
    }

    try {
      await prisma.menuCategory.delete({ where: { id } });
    } catch (deleteError) {
      if (deleteError instanceof Prisma.PrismaClientKnownRequestError && deleteError.code === "P2003") {
        return errorResponse(res, apiMessage("category.inUse", requestedLanguage), 422, "CATEGORY_IN_USE");
      }
      throw deleteError;
    }

    return successResponse(res, "Category deleted successfully", { id }, 200);
  } catch (error) {
    console.error("deleteBusinessCategory error:", error.message);
    const language = getRequestedLanguage(req);
    return errorResponse(res, apiMessage("category.serverError", language), 500, "ERROR");
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.menuCategory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Category not found", 404, "NOT_FOUND");
    }

    await prisma.menuCategory.delete({ where: { id } });

    return successResponse(res, "Category deleted successfully", { id }, 200);
  } catch (error) {
    console.error("deleteCategory error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
