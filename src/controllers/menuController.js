const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");

const FOOD_TYPES = new Set(["veg", "non_veg"]);

async function loadCategoryBySlug(slug) {
  return prisma.menuCategory.findUnique({
    where: { slug },
    select: { slug: true, name: true },
  });
}

/**
 * Stored as `isGlobal` on the row:
 * - `false` only when both business and creator are set → private user item.
 * - `true` otherwise (catalog / bulk import without creator / missing business or user).
 */
function deriveIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

/** List/detail visibility: own rows always; else business must match when set; unscoped rows use isGlobal / creator rules. */
function canViewMenuItem(menu, contextBusinessId, userId) {
  if (menu.createdByUserId === userId) {
    return true;
  }
  if (menu.businessId != null && menu.businessId !== contextBusinessId) {
    return false;
  }
  if (menu.businessId == null) {
    return menu.isGlobal === true;
  }
  const dg = deriveIsGlobal(menu.businessId, menu.createdByUserId);
  return dg;
}

function normalizeIngredients(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  return raw;
}

function collectSupplyItemIds(ingredientLists) {
  const ids = new Set();
  for (const raw of ingredientLists) {
    for (const r of normalizeIngredients(raw)) {
      const sid = r?.supply_item_id ?? r?.supplyItemId;
      const id = typeof sid === "string" ? sid.trim() : "";
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

async function fetchSupplyItemsById(ids) {
  if (ids.length === 0) return new Map();
  const rows = await prisma.supplyItem.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      unitOptions: true,
      defaultUnit: true,
    },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

function applySupplyUnitsToIngredients(rawIngredients, supplyById, language) {
  const ingredients = normalizeIngredients(rawIngredients);
  return ingredients.map((row) => {
    const sid = row?.supply_item_id ?? row?.supplyItemId;
    const id = typeof sid === "string" ? sid.trim() : "";
    if (!id) return row;
    const source = supplyById.get(id);
    if (!source) return row;
    const unitOptions = Array.isArray(source.unitOptions) ? source.unitOptions : [];
    const localizedName = resolveLocalizedName(source.name, language);
    return {
      ...row,
      name: localizedName || row.name,
      unit_options: unitOptions,
      default_unit: source.defaultUnit ?? null,
      supply_item: {
        id: source.id,
        unit_options: unitOptions,
        default_unit: source.defaultUnit ?? null,
      },
    };
  });
}

/** Single-row convenience wrapper (detail endpoints). List endpoints should
 * batch via `collectSupplyItemIds` + `fetchSupplyItemsById` across all rows
 * in the page instead of calling this per row. */
async function enrichIngredientsWithSupplyUnits(rawIngredients, language) {
  const ids = collectSupplyItemIds([rawIngredients]);
  const supplyById = await fetchSupplyItemsById(ids);
  return applySupplyUnitsToIngredients(rawIngredients, supplyById, language);
}

/** Same visibility branches as `supplyController.listSupplyItems`. */
function supplyVisibilityOrBranchesForIngredients(businessId, userId) {
  return [
    { businessId, OR: [{ isGlobal: true }, { createdByUserId: userId }] },
    { businessId: null, OR: [{ createdByUserId: userId }, { isGlobal: true }] },
    { createdByUserId: userId },
  ];
}

/**
 * When ingredient rows include `supply_item_id`, ensure each ID refers to an
 * active INGREDIENT supply row visible to this business (same rules as catalog list).
 */
async function validateIngredientSupplyRefs(ingredients, businessId, userId) {
  const rows = normalizeIngredients(ingredients);
  const ids = [
    ...new Set(
      rows
        .map((r) => {
          const raw = r?.supply_item_id ?? r?.supplyItemId;
          return typeof raw === "string" ? raw.trim() : "";
        })
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) return null;
  const count = await prisma.supplyItem.count({
    where: {
      AND: [
        { OR: supplyVisibilityOrBranchesForIngredients(businessId, userId) },
        { id: { in: ids } },
        { isActive: true },
        { type: "INGREDIENT" },
      ],
    },
  });
  if (count !== ids.length) {
    return "One or more supply_item_id values are invalid, inactive, or not visible for this business.";
  }
  return null;
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

/**
 * Row IDs where at least one ingredient object has a matching `name` (case-insensitive substring).
 */
async function findIdsMatchingIngredientNames(searchTerm, orBranches) {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT m.id
    FROM "MenuItem" m,
    LATERAL jsonb_array_elements(COALESCE(m."ingredients"::jsonb, '[]'::jsonb)) AS elem
    WHERE (elem->>'name') IS NOT NULL
      AND POSITION(LOWER(${searchTerm}) IN LOWER(elem->>'name')) > 0
  `;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const visible = await prisma.menuItem.findMany({
    where: {
      AND: [{ OR: orBranches }, { id: { in: ids } }],
    },
    select: { id: true },
  });
  return visible.map((r) => r.id);
}

async function findIdsMatchingLocalizedNames(searchTerm, orBranches) {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT m.id
    FROM "MenuItem" m,
    LATERAL jsonb_each_text(COALESCE(m."name"::jsonb, '{}'::jsonb)) AS n(lang, val)
    WHERE POSITION(LOWER(${searchTerm}) IN LOWER(n.val)) > 0
  `;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const visible = await prisma.menuItem.findMany({
    where: {
      AND: [{ OR: orBranches }, { id: { in: ids } }],
    },
    select: { id: true },
  });
  return visible.map((r) => r.id);
}

function sumIngredientCosts(ingredients) {
  let sum = 0;
  for (const i of ingredients) {
    const c = i?.cost;
    const n = typeof c === "number" ? c : Number(c);
    sum += Number.isFinite(n) ? n : 0;
  }
  return sum;
}

function formatMenuItem(
  row,
  { includeFinancials = true, language = "en", minimal = false } = {},
) {
  const category = {
    name: resolveLocalizedName(row.category?.name, language),
    slug: row.category?.slug ?? row.categorySlug,
  };

  const base = {
    _id: row.id,
    name: resolveLocalizedName(row.name, language),
    price_per_person: Number(row.pricePerPerson),
    category,
    food_type: row.foodType,
    business_id: row.businessId,
    created_by: row.createdByUserId,
    is_global: deriveIsGlobal(row.businessId, row.createdByUserId),
    parent_menu_id: row.parentMenuId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };

  // Skipped in `minimal` mode (e.g. a picker list row) — these are the
  // fields that make the full response heavy: full description/recipe,
  // per-ingredient detail, and image URL.
  if (!minimal) {
    const ingredients = normalizeIngredients(row.ingredients);
    base.description = row.description ?? null;
    base.how_to_make = row.howToMake ?? null;
    base.ingredients = ingredients;
    base.image_url = row.imageUrl ?? null;

    if (includeFinancials) {
      const estimated_cost = sumIngredientCosts(ingredients);
      const profit = base.price_per_person - estimated_cost;
      const profit_margin =
        base.price_per_person === 0 ? 0 : (profit / base.price_per_person) * 100;
      base.estimated_cost = estimated_cost;
      base.profit = profit;
      base.profit_margin = profit_margin;
    }
  }

  return base;
}

exports.createMenuItem = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const userId = req.user.userId;
    const businessId = req.businessId;

    const {
      name,
      price_per_person,
      category,
      category_slug,
      food_type,
      ingredients,
      image_url,
      description,
      how_to_make,
    } =
      req.body;

    if (
      Object.prototype.hasOwnProperty.call(req.body, "_id") ||
      Object.prototype.hasOwnProperty.call(req.body, "id")
    ) {
      return errorResponse(
        res,
        "Invalid request fields",
        422,
        "VALIDATION_ERROR",
        "Menu item id is auto-generated; do not send _id or id in the body.",
      );
    }

    if (
      !name ||
      price_per_person === undefined ||
      (category_slug == null && category == null) ||
      !food_type ||
      typeof food_type !== "string"
    ) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "name, price_per_person, category/category_slug, and food_type are required.",
      );
    }
    const normalizedName = normalizeLocalizedName(name);
    if (!normalizedName) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "name must be a non-empty string or localized object.",
      );
    }
    const categorySlug = String(category_slug ?? category ?? "")
      .trim()
      .toLowerCase();
    if (!categorySlug) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "category_slug is required.",
      );
    }
    const categoryRow = await loadCategoryBySlug(categorySlug);
    if (!categoryRow) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "category_slug must match an active menu category slug.",
      );
    }

    if (!FOOD_TYPES.has(food_type)) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "food_type must be veg or non_veg.",
      );
    }

    const price = Number(price_per_person);
    if (!Number.isFinite(price) || price < 0) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "price_per_person must be a non-negative number.",
      );
    }

    const ing = normalizeIngredients(ingredients);
    if (!hasValidIngredients(ing)) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "Each ingredient row must include name. qty is optional, but if provided it must be greater than 0.",
      );
    }
    const ingSupplyErr = await validateIngredientSupplyRefs(
      ing,
      businessId,
      userId,
    );
    if (ingSupplyErr) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        ingSupplyErr,
      );
    }

    let resolvedImageUrl = null;
    if (image_url !== undefined && image_url !== null) {
      if (typeof image_url !== "string") {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "image_url must be a string URL or omitted.",
        );
      }
      const trimmed = image_url.trim();
      resolvedImageUrl = trimmed === "" ? null : trimmed;
    }

    let resolvedDescription = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== "string") {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "description must be a string or omitted.",
        );
      }
      const trimmed = description.trim();
      if (trimmed.length > 5000) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "description must be 5000 characters or fewer.",
        );
      }
      resolvedDescription = trimmed === "" ? null : trimmed;
    }

    let resolvedHowToMake = null;
    if (how_to_make !== undefined && how_to_make !== null) {
      if (typeof how_to_make !== "string") {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "how_to_make must be a string or omitted.",
        );
      }
      const trimmed = how_to_make.trim();
      if (trimmed.length > 10000) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "how_to_make must be 10000 characters or fewer.",
        );
      }
      resolvedHowToMake = trimmed === "" ? null : trimmed;
    }

    const created = await prisma.menuItem.create({
      data: {
        name: normalizedName,
        description: resolvedDescription,
        howToMake: resolvedHowToMake,
        pricePerPerson: new Prisma.Decimal(String(price)),
        categorySlug: categoryRow.slug,
        foodType: food_type,
        businessId,
        createdByUserId: userId,
        isGlobal: deriveIsGlobal(businessId, userId),
        parentMenuId: null,
        ingredients: ing,
        imageUrl: resolvedImageUrl,
      },
      include: { category: true },
    });

    return successResponse(
      res,
      "Menu item created successfully",
      formatMenuItem(created, {
        includeFinancials: false,
        language: requestedLanguage,
      }),
      201,
    );
  } catch (error) {
    console.error("createMenuItem error:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

exports.listMenuItems = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const userId = req.user.userId;
    const businessId = req.businessId;

    const { category, categories, food_type, search, q, self_only, exclude_self, minimal } =
      req.query;
    const isMinimal =
      String(minimal ?? "").toLowerCase() === "true" || minimal === "1";

    const visibilityOr = [{ isGlobal: true }, { createdByUserId: userId }];

    const orBranches = [
      {
        businessId,
        OR: visibilityOr,
      },
      {
        businessId: null,
        OR: [{ createdByUserId: userId }, { isGlobal: true }],
      },
      { createdByUserId: userId },
    ];

    const searchTerm = String(search ?? q ?? "").trim();
    if (searchTerm !== "") {
      if (searchTerm.length > 200) {
        return errorResponse(
          res,
          "Invalid query parameters",
          422,
          "VALIDATION_ERROR",
          "search must be 200 characters or fewer.",
        );
      }
    }

    if (food_type != null && String(food_type).trim() !== "") {
      if (!FOOD_TYPES.has(String(food_type).trim())) {
        return errorResponse(
          res,
          "Invalid query parameters",
          422,
          "VALIDATION_ERROR",
          "food_type filter must be veg or non_veg.",
        );
      }
    }

    const pageRaw = req.query.page ?? req.query.current_page;
    const perPageRaw = req.query.per_page;
    let page = parseInt(String(pageRaw ?? "1"), 10);
    let perPage = parseInt(String(perPageRaw ?? "10"), 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(perPage) || perPage < 1) perPage = 10;
    if (perPage > 100) perPage = 100;

    const skip = (page - 1) * perPage;

    const categoriesParam =
      categories != null && String(categories).trim() !== ""
        ? String(categories).trim()
        : null;
    const categoryLegacy =
      category != null && String(category).trim() !== ""
        ? String(category).trim()
        : null;

    let categorySlugs = [];
    if (categoriesParam != null) {
      categorySlugs = categoriesParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (categoryLegacy != null) {
      categorySlugs = [categoryLegacy];
    }

    const foodTypeTrim =
      food_type != null && String(food_type).trim() !== ""
        ? String(food_type).trim()
        : null;

    const selfOnly =
      String(self_only ?? "").toLowerCase() === "true" || self_only === "1";
    const excludeSelf =
      String(exclude_self ?? "").toLowerCase() === "true" || exclude_self === "1";

    const filterAnd = [];
    if (categorySlugs.length > 0) {
      const orCategoryBranches = [];
      for (const slug of categorySlugs) {
        orCategoryBranches.push({ categorySlug: slug });
      }
      if (orCategoryBranches.length > 0) {
        filterAnd.push({ OR: orCategoryBranches });
      }
    }
    if (selfOnly) {
      // "Self" tab should only show user-created private items.
      filterAnd.push({ createdByUserId: userId });
      filterAnd.push({ isGlobal: false });
      filterAnd.push({ businessId });
    } else if (excludeSelf) {
      // "All" tab should hide only self-added private items,
      // but still include global/catalog rows even if createdByUserId matches.
      filterAnd.push({
        NOT: {
          AND: [{ createdByUserId: userId }, { isGlobal: false }, { businessId }],
        },
      });
    }
    if (foodTypeTrim != null) {
      filterAnd.push({ foodType: foodTypeTrim });
    }
    if (searchTerm !== "") {
      // Search only: dish name, or any ingredient’s `name` inside ingredients[].
      const searchOr = [
        { description: { contains: searchTerm, mode: "insensitive" } },
      ];
      const [nameMatchIds, ingredientNameIds] = await Promise.all([
        findIdsMatchingLocalizedNames(searchTerm, orBranches),
        findIdsMatchingIngredientNames(searchTerm, orBranches),
      ]);
      if (nameMatchIds.length > 0) {
        searchOr.push({ id: { in: nameMatchIds } });
      }
      if (ingredientNameIds.length > 0) {
        searchOr.push({ id: { in: ingredientNameIds } });
      }

      filterAnd.push({ OR: searchOr });
    }

    const where =
      filterAnd.length > 0
        ? { AND: [{ OR: orBranches }, ...filterAnd] }
        : { OR: orBranches };

    const [totalRecord, rows] = await Promise.all([
      prisma.menuItem.count({ where }),
      prisma.menuItem.findMany({
        where,
        orderBy: [{ categorySlug: "asc" }, { updatedAt: "desc" }],
        skip,
        take: perPage,
        include: { category: true },
      }),
    ]);

    const lastPage =
      totalRecord === 0 ? 0 : Math.ceil(totalRecord / perPage);
    const from = totalRecord === 0 ? 0 : skip + 1;
    const to = totalRecord === 0 ? 0 : Math.min(skip + perPage, totalRecord);

    const data = rows.map((row) =>
      formatMenuItem(row, {
        includeFinancials: true,
        language: requestedLanguage,
        minimal: isMinimal,
      }),
    );

    // Batch the ingredient→supply-item unit lookup once across the whole
    // page instead of one query per row (skipped entirely for `minimal`,
    // which doesn't return ingredients at all).
    if (!isMinimal) {
      const supplyIds = collectSupplyItemIds(rows.map((r) => r.ingredients));
      const supplyById = await fetchSupplyItemsById(supplyIds);
      for (const item of data) {
        item.ingredients = applySupplyUnitsToIngredients(
          item.ingredients,
          supplyById,
          requestedLanguage,
        );
      }
    }

    return successResponse(res, "Menu items fetched successfully", data, 200, {
      pagination: {
        current_page: page,
        per_page: perPage,
        total_record: totalRecord,
        last_page: lastPage,
        from,
        to,
      },
    });
  } catch (error) {
    console.error("listMenuItems error:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

exports.getMenuItem = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const userId = req.user.userId;
    const businessId = req.businessId;
    const { id } = req.params;

    const menu = await prisma.menuItem.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!menu) {
      return errorResponse(
        res,
        "Menu item not found",
        404,
        "NOT_FOUND",
        "Menu item does not exist",
      );
    }

    if (!canViewMenuItem(menu, businessId, userId)) {
      return errorResponse(
        res,
        "Menu item not found",
        404,
        "NOT_FOUND",
        "Menu item does not exist",
      );
    }

    const payload = formatMenuItem(menu, {
      includeFinancials: true,
      language: requestedLanguage,
    });
    payload.ingredients = await enrichIngredientsWithSupplyUnits(
      payload.ingredients,
      requestedLanguage,
    );

    return successResponse(
      res,
      "Menu item fetched successfully",
      payload,
      200,
    );
  } catch (error) {
    console.error("getMenuItem error:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

exports.updateMenuItem = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const userId = req.user.userId;
    const businessId = req.businessId;
    const { id } = req.params;

    const menu = await prisma.menuItem.findUnique({
      where: { id },
    });

    if (!menu) {
      return errorResponse(
        res,
        "Menu item not found",
        404,
        "NOT_FOUND",
        "Menu item does not exist",
      );
    }

    if (!canViewMenuItem(menu, businessId, userId)) {
      return errorResponse(
        res,
        "You do not have permission to update this item.",
        403,
        "FORBIDDEN",
        "This item is not visible in your current business context.",
      );
    }

    const dgMenu = deriveIsGlobal(menu.businessId, menu.createdByUserId);
    if (!dgMenu && menu.createdByUserId != null && menu.createdByUserId !== userId) {
      return errorResponse(
        res,
        "You do not have permission to update this item.",
        403,
        "FORBIDDEN",
        "This item belongs to another user.",
      );
    }

    const {
      name,
      price_per_person,
      category,
      category_slug,
      food_type,
      ingredients,
      image_url,
      description,
      how_to_make,
    } =
      req.body;
    const updates = {};

    if (name !== undefined) {
      const normalizedName = normalizeLocalizedName(name);
      if (!normalizedName) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "name must be a non-empty string or localized object.",
        );
      }
      updates.name = normalizedName;
    }
    if (price_per_person !== undefined) {
      const price = Number(price_per_person);
      if (!Number.isFinite(price) || price < 0) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "price_per_person must be a non-negative number.",
        );
      }
      updates.pricePerPerson = new Prisma.Decimal(String(price));
    }
    if (category !== undefined || category_slug !== undefined) {
      const slug = String(category_slug ?? category ?? "")
        .trim()
        .toLowerCase();
      if (!slug) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "category_slug must be a non-empty string.",
        );
      }
      const categoryRow = await loadCategoryBySlug(slug);
      if (!categoryRow) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "category_slug must match an existing menu category.",
        );
      }
      updates.categorySlug = categoryRow.slug;
    }
    if (food_type !== undefined) {
      if (!FOOD_TYPES.has(food_type)) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "food_type must be veg or non_veg.",
        );
      }
      updates.foodType = food_type;
    }
    if (ingredients !== undefined) {
      if (!Array.isArray(ingredients)) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "ingredients must be an array.",
        );
      }
      if (!hasValidIngredients(ingredients)) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "Each ingredient row must include name. qty is optional, but if provided it must be greater than 0.",
        );
      }
      const ingSupplyErr = await validateIngredientSupplyRefs(
        ingredients,
        businessId,
        userId,
      );
      if (ingSupplyErr) {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          ingSupplyErr,
        );
      }
      updates.ingredients = ingredients;
    }
    if (image_url !== undefined) {
      if (image_url !== null && typeof image_url !== "string") {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "image_url must be a string URL, null, or omitted.",
        );
      }
      if (image_url === null) {
        updates.imageUrl = null;
      } else {
        const trimmed = image_url.trim();
        updates.imageUrl = trimmed === "" ? null : trimmed;
      }
    }
    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "description must be a string, null, or omitted.",
        );
      }
      if (description === null) {
        updates.description = null;
      } else {
        const trimmed = description.trim();
        if (trimmed.length > 5000) {
          return errorResponse(
            res,
            "Missing or invalid request fields",
            422,
            "VALIDATION_ERROR",
            "description must be 5000 characters or fewer.",
          );
        }
        updates.description = trimmed === "" ? null : trimmed;
      }
    }
    if (how_to_make !== undefined) {
      if (how_to_make !== null && typeof how_to_make !== "string") {
        return errorResponse(
          res,
          "Missing or invalid request fields",
          422,
          "VALIDATION_ERROR",
          "how_to_make must be a string, null, or omitted.",
        );
      }
      if (how_to_make === null) {
        updates.howToMake = null;
      } else {
        const trimmed = how_to_make.trim();
        if (trimmed.length > 10000) {
          return errorResponse(
            res,
            "Missing or invalid request fields",
            422,
            "VALIDATION_ERROR",
            "how_to_make must be 10000 characters or fewer.",
          );
        }
        updates.howToMake = trimmed === "" ? null : trimmed;
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse(
        res,
        "Missing or invalid request fields",
        422,
        "VALIDATION_ERROR",
        "Provide at least one field to update.",
      );
    }

    if (deriveIsGlobal(menu.businessId, menu.createdByUserId)) {
      const existingFork = await prisma.menuItem.findFirst({
        where: { parentMenuId: menu.id, businessId, createdByUserId: userId },
      });

      if (existingFork) {
        const updatedFork = await prisma.menuItem.update({
          where: { id: existingFork.id },
          data: updates,
          include: { category: true },
        });

        return successResponse(
          res,
          "Menu item updated successfully",
          formatMenuItem(updatedFork, {
            includeFinancials: false,
            language: requestedLanguage,
          }),
          200,
        );
      }

      const newItem = await prisma.menuItem.create({
        data: {
          name: updates.name ?? menu.name,
          description:
            updates.description !== undefined ? updates.description : menu.description ?? null,
          howToMake:
            updates.howToMake !== undefined ? updates.howToMake : menu.howToMake ?? null,
          pricePerPerson:
            updates.pricePerPerson ??
            menu.pricePerPerson,
          categorySlug: updates.categorySlug ?? menu.categorySlug,
          foodType: updates.foodType ?? menu.foodType,
          businessId,
          createdByUserId: userId,
          isGlobal: deriveIsGlobal(businessId, userId),
          parentMenuId: menu.id,
          ingredients: updates.ingredients ?? normalizeIngredients(menu.ingredients),
          imageUrl:
            updates.imageUrl !== undefined ? updates.imageUrl : menu.imageUrl ?? null,
        },
        include: { category: true },
      });

      return successResponse(
        res,
        "Menu item updated successfully",
        formatMenuItem(newItem, {
          includeFinancials: false,
          language: requestedLanguage,
        }),
        201,
      );
    }

    const updated = await prisma.menuItem.update({
      where: { id: menu.id },
      data: updates,
      include: { category: true },
    });

    return successResponse(
      res,
      "Menu item updated successfully",
      formatMenuItem(updated, {
        includeFinancials: false,
        language: requestedLanguage,
      }),
      200,
    );
  } catch (error) {
    console.error("updateMenuItem error:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};

exports.deleteMenuItem = async (req, res) => {
  try {
    const userId = req.user.userId;
    const businessId = req.businessId;
    const { id } = req.params;

    const menu = await prisma.menuItem.findUnique({
      where: { id },
    });

    if (!menu) {
      return errorResponse(
        res,
        "Menu item not found",
        404,
        "NOT_FOUND",
        "Menu item does not exist",
      );
    }

    if (!canViewMenuItem(menu, businessId, userId)) {
      return errorResponse(
        res,
        "You do not have permission to delete this item.",
        403,
        "FORBIDDEN",
        "This item is not visible in your current business context.",
      );
    }

    const dgDel = deriveIsGlobal(menu.businessId, menu.createdByUserId);
    if (dgDel && menu.createdByUserId != null) {
      return errorResponse(
        res,
        "You do not have permission to delete this item.",
        403,
        "FORBIDDEN",
        "Global items are admin-managed and cannot be deleted via this endpoint.",
      );
    }

    if (!dgDel && menu.createdByUserId !== userId) {
      return errorResponse(
        res,
        "You do not have permission to delete this item.",
        403,
        "FORBIDDEN",
        "This item belongs to another user.",
      );
    }

    await prisma.menuItem.delete({
      where: { id: menu.id },
    });

    return successResponse(res, "Menu item deleted successfully", null, 200);
  } catch (error) {
    console.error("deleteMenuItem error:", error.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};
