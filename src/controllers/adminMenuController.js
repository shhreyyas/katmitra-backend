const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");

const FOOD_TYPES = new Set(["veg", "non_veg"]);

function deriveIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

function normalizeIngredients(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  return raw;
}

function hasValidIngredients(raw) {
  const arr = normalizeIngredients(raw);
  if (!arr.length) return true;
  return arr.every((r) => {
    const name = String(r?.name ?? "").trim();
    if (!name) return false;
    const qtyRaw = String(r?.qty ?? "").trim();
    if (!qtyRaw) return true;
    const qty = Number(qtyRaw);
    return Number.isFinite(qty) && qty > 0;
  });
}

async function loadCategoryBySlug(slug) {
  return prisma.menuCategory.findUnique({
    where: { slug },
    select: { slug: true, name: true, isActive: true },
  });
}

function formatAdminMenuItem(row, language = "en") {
  const isGlobal = deriveIsGlobal(row.businessId, row.createdByUserId);
  return {
    id: row.id,
    name: resolveLocalizedName(row.name, language),
    name_i18n: row.name,
    description: row.description ?? null,
    how_to_make: row.howToMake ?? null,
    price_per_person: Number(row.pricePerPerson),
    category_slug: row.categorySlug,
    category_name: row.category
      ? resolveLocalizedName(row.category.name, language)
      : row.categorySlug,
    food_type: row.foodType,
    business_id: row.businessId,
    business_name: row.business?.name ?? null,
    is_global: isGlobal,
    ingredients: normalizeIngredients(row.ingredients),
    image_url: row.imageUrl ?? null,
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

/** GET /api/admin/v1/businesses — picker for business-scoped items */
exports.listBusinesses = async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const where = q
      ? { name: { contains: q, mode: "insensitive" } }
      : {};
    const rows = await prisma.business.findMany({
      where,
      select: { id: true, name: true, ownerName: true },
      orderBy: { name: "asc" },
      take: 200,
    });
    return successResponse(res, "Businesses", { businesses: rows });
  } catch (error) {
    console.error("listBusinesses admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** GET /api/admin/v1/menu-items */
exports.listMenuItems = async (req, res) => {
  try {
    const language = getRequestedLanguage(req);
    const scope = String(req.query.scope ?? "all").toLowerCase();
    const businessId = String(req.query.business_id ?? "").trim();
    const categorySlug = String(req.query.category_slug ?? "").trim();
    const foodType = String(req.query.food_type ?? "").trim();
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
    if (foodType && FOOD_TYPES.has(foodType)) where.foodType = foodType;

    let rows = await prisma.menuItem.findMany({
      where,
      include: { category: true, business: { select: { id: true, name: true } } },
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

    return successResponse(res, "Menu items", {
      items: rows.map((r) => formatAdminMenuItem(r, language)),
    });
  } catch (error) {
    console.error("listMenuItems admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** POST /api/admin/v1/menu-items */
exports.createMenuItem = async (req, res) => {
  try {
    const language = getRequestedLanguage(req);
    const adminUserId = req.user.userId;
    const scopeResult = resolveAdminScope(req.body);
    if (scopeResult.error) {
      return errorResponse(res, scopeResult.error, 422, "VALIDATION_ERROR");
    }
    const { businessId } = scopeResult;

    const {
      name,
      price_per_person,
      category_slug,
      food_type,
      ingredients,
      image_url,
      description,
      how_to_make,
    } = req.body;

    const normalizedName = normalizeLocalizedName(name);
    if (!normalizedName) {
      return errorResponse(res, "name is required", 422, "VALIDATION_ERROR");
    }

    const categorySlug = String(category_slug ?? "").trim().toLowerCase();
    if (!categorySlug) {
      return errorResponse(res, "category_slug is required", 422, "VALIDATION_ERROR");
    }
    const categoryRow = await loadCategoryBySlug(categorySlug);
    if (!categoryRow) {
      return errorResponse(res, "Invalid category_slug", 422, "VALIDATION_ERROR");
    }

    if (!FOOD_TYPES.has(food_type)) {
      return errorResponse(res, "food_type must be veg or non_veg", 422, "VALIDATION_ERROR");
    }

    const price = Number(price_per_person);
    if (!Number.isFinite(price) || price < 0) {
      return errorResponse(res, "Invalid price_per_person", 422, "VALIDATION_ERROR");
    }

    const ing = normalizeIngredients(ingredients);
    if (!hasValidIngredients(ing)) {
      return errorResponse(res, "Invalid ingredients", 422, "VALIDATION_ERROR");
    }

    if (businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (!biz) {
        return errorResponse(res, "Business not found", 404, "NOT_FOUND");
      }
    }

    const created = await prisma.menuItem.create({
      data: {
        name: normalizedName,
        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : null,
        howToMake:
          typeof how_to_make === "string" && how_to_make.trim()
            ? how_to_make.trim()
            : null,
        pricePerPerson: new Prisma.Decimal(String(price)),
        categorySlug: categoryRow.slug,
        foodType: food_type,
        businessId,
        createdByUserId: adminUserId,
        isGlobal: deriveIsGlobal(businessId, adminUserId),
        parentMenuId: null,
        ingredients: ing,
        imageUrl:
          typeof image_url === "string" && image_url.trim() ? image_url.trim() : null,
      },
      include: { category: true, business: { select: { id: true, name: true } } },
    });

    return successResponse(
      res,
      "Menu item created",
      formatAdminMenuItem(created, language),
      201,
    );
  } catch (error) {
    console.error("createMenuItem admin:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

/** PUT /api/admin/v1/menu-items/:id */
exports.updateMenuItem = async (req, res) => {
  try {
    const language = getRequestedLanguage(req);
    const adminUserId = req.user.userId;
    const { id } = req.params;

    const existing = await prisma.menuItem.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Menu item not found", 404, "NOT_FOUND");
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

    if (req.body.name !== undefined) {
      const normalizedName = normalizeLocalizedName(req.body.name);
      if (!normalizedName) {
        return errorResponse(res, "Invalid name", 422, "VALIDATION_ERROR");
      }
      updates.name = normalizedName;
    }
    if (req.body.price_per_person !== undefined) {
      const price = Number(req.body.price_per_person);
      if (!Number.isFinite(price) || price < 0) {
        return errorResponse(res, "Invalid price", 422, "VALIDATION_ERROR");
      }
      updates.pricePerPerson = new Prisma.Decimal(String(price));
    }
    if (req.body.category_slug !== undefined) {
      const slug = String(req.body.category_slug).trim().toLowerCase();
      const categoryRow = await loadCategoryBySlug(slug);
      if (!categoryRow) {
        return errorResponse(res, "Invalid category", 422, "VALIDATION_ERROR");
      }
      updates.categorySlug = slug;
    }
    if (req.body.food_type !== undefined) {
      if (!FOOD_TYPES.has(req.body.food_type)) {
        return errorResponse(res, "Invalid food_type", 422, "VALIDATION_ERROR");
      }
      updates.foodType = req.body.food_type;
    }
    if (req.body.ingredients !== undefined) {
      const ing = normalizeIngredients(req.body.ingredients);
      if (!hasValidIngredients(ing)) {
        return errorResponse(res, "Invalid ingredients", 422, "VALIDATION_ERROR");
      }
      updates.ingredients = ing;
    }
    if (req.body.image_url !== undefined) {
      updates.imageUrl =
        typeof req.body.image_url === "string" && req.body.image_url.trim()
          ? req.body.image_url.trim()
          : null;
    }
    if (req.body.description !== undefined) {
      updates.description =
        typeof req.body.description === "string" && req.body.description.trim()
          ? req.body.description.trim()
          : null;
    }
    if (req.body.how_to_make !== undefined) {
      updates.howToMake =
        typeof req.body.how_to_make === "string" && req.body.how_to_make.trim()
          ? req.body.how_to_make.trim()
          : null;
    }

    const row = await prisma.menuItem.update({
      where: { id },
      data: updates,
      include: { category: true, business: { select: { id: true, name: true } } },
    });

    return successResponse(res, "Menu item updated", formatAdminMenuItem(row, language));
  } catch (error) {
    console.error("updateMenuItem admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** DELETE /api/admin/v1/menu-items/:id */
exports.deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.menuItem.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Menu item not found", 404, "NOT_FOUND");
    }
    await prisma.menuItem.delete({ where: { id } });
    return successResponse(res, "Menu item deleted", { id });
  } catch (error) {
    console.error("deleteMenuItem admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
