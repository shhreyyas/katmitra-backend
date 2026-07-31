const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { successResponse, errorResponse } = require("../utils/response");
const { getRequestedLanguage, resolveLocalizedName } = require("../utils/localization");

function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseIngredients(ingredients) {
  if (Array.isArray(ingredients)) return ingredients;
  if (typeof ingredients === "string") {
    try {
      const parsed = JSON.parse(ingredients);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildDishHowToMake(menuItems, language) {
  return (menuItems || [])
    .map((row) => {
      const howToMake = String(row.menuItem?.howToMake ?? "").trim();
      if (!howToMake) return null;
      return {
        menu_item_id: row.menuItem.id,
        menu_item_name: resolveLocalizedName(row.menuItem.name, language),
        instructions: howToMake,
      };
    })
    .filter(Boolean);
}

function normalizeIngredientRows(raw) {
  const arr = parseIngredients(raw);
  const out = [];
  for (const ing of arr) {
    const ingredientName = String(ing?.ingredient_name ?? ing?.name ?? "").trim();
    if (!ingredientName) continue;
    const unit = String(ing?.unit ?? "").trim();
    const totalQty = num(ing?.total_quantity ?? ing?.qty);
    if (totalQty < 0) continue;
    out.push({
      ingredient_name: ingredientName,
      unit,
      total_quantity: totalQty,
    });
  }
  return out.sort((a, b) =>
    String(a.ingredient_name).localeCompare(String(b.ingredient_name)),
  );
}

/** Supports legacy array storage and `{ customized, items }` wrapper after PATCH. */
function readDishRequiredIngredientsStorage(raw) {
  if (raw == null) {
    return { customized: false, items: [] };
  }
  if (Array.isArray(raw)) {
    const items = normalizeIngredientRows(raw);
    return { customized: items.length > 0, items };
  }
  if (typeof raw === "object") {
    const items = normalizeIngredientRows(raw.items ?? raw.rows ?? []);
    const customized =
      raw.customized === true ||
      raw.v === 1 ||
      (raw.customized !== false && items.length > 0);
    return { customized, items };
  }
  return { customized: false, items: [] };
}

/** Persist as a plain array so older API builds can read saved qty/unit. */
function writeDishRequiredIngredientsStorage(items) {
  return items;
}

function normalizeDishRequiredIngredientsPayload(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const ing of raw) {
    const ingredientName = String(ing?.ingredient_name ?? ing?.name ?? "").trim();
    if (!ingredientName) continue;
    const unit = String(ing?.unit ?? "").trim();
    const totalQty = num(ing?.total_quantity ?? ing?.qty);
    if (totalQty < 0) continue;
    out.push({
      ingredient_name: ingredientName,
      unit,
      total_quantity: totalQty,
    });
  }
  return out;
}

async function resolveTotalRequiredIngredients(dish, language) {
  const stored = readDishRequiredIngredientsStorage(dish.requiredIngredients);
  if (dish.requiredIngredientsCustomized === true || stored.customized) {
    return stored.items;
  }
  return buildTotalRequiredIngredients(dish.menuItems || [], language);
}

/** Fetches localized names for supply items referenced by `supply_item_id`, keyed by id. */
async function fetchSupplyItemNameMap(ids, language) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();
  const rows = await prisma.supplyItem.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  });
  return new Map(
    rows.map((r) => [r.id, resolveLocalizedName(r.name, language)]),
  );
}

async function buildTotalRequiredIngredients(menuItems, language) {
  const rows = menuItems || [];
  const supplyItemIds = [];
  for (const row of rows) {
    for (const ing of parseIngredients(row.menuItem?.ingredients)) {
      const sid = ing?.supply_item_id ?? ing?.supplyItemId;
      if (typeof sid === "string" && sid.trim()) supplyItemIds.push(sid.trim());
    }
  }
  const supplyNameById = await fetchSupplyItemNameMap(supplyItemIds, language);

  const buckets = new Map();
  for (const row of rows) {
    const multiplier = Math.max(1, parseInt(String(row.quantity ?? 1), 10) || 1);
    const ingredients = parseIngredients(row.menuItem?.ingredients);
    for (const ing of ingredients) {
      const sid = ing?.supply_item_id ?? ing?.supplyItemId;
      const localizedName =
        typeof sid === "string" ? supplyNameById.get(sid.trim()) : undefined;
      const ingredientName = (localizedName || String(ing?.name ?? "")).trim();
      if (!ingredientName) continue;
      const unit = String(ing?.unit ?? "").trim();
      const qty = num(ing?.qty);
      if (qty <= 0) continue;
      const totalQty = qty * multiplier;
      const key = `${ingredientName.toLowerCase()}::${unit.toLowerCase()}`;
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          ingredient_name: ingredientName,
          unit,
          total_quantity: totalQty,
        });
      } else {
        existing.total_quantity = num(existing.total_quantity) + totalQty;
      }
    }
  }
  return Array.from(buckets.values()).sort((a, b) =>
    String(a.ingredient_name).localeCompare(String(b.ingredient_name)),
  );
}

/** Fields loaded for list / picker endpoints (avoids large MenuItem.ingredients blobs). */
const DISH_LIST_MENU_ITEM_SELECT = {
  id: true,
  name: true,
  pricePerPerson: true,
  categorySlug: true,
  category: { select: { slug: true, name: true } },
};

const DISH_LIST_INCLUDE = {
  menuItems: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      menuItemId: true,
      quantity: true,
      menuItem: { select: DISH_LIST_MENU_ITEM_SELECT },
    },
  },
};

function serializeDishListItem(dish, language) {
  return {
    id: dish.id,
    business_id: dish.businessId,
    name: dish.name,
    price_per_plate: num(dish.pricePerPlate),
    is_template: dish.isTemplate,
    parent_dish_id: dish.parentDishId,
    menu_items: (dish.menuItems || []).map((row) => ({
      id: row.id,
      menu_item_id: row.menuItemId,
      quantity: row.quantity ?? 1,
      menu_item: row.menuItem
        ? {
            id: row.menuItem.id,
            name: resolveLocalizedName(row.menuItem.name, language),
            price_per_person: num(row.menuItem.pricePerPerson),
            category: {
              name: resolveLocalizedName(row.menuItem.category?.name, language),
              slug: row.menuItem.category?.slug ?? row.menuItem.categorySlug,
            },
          }
        : undefined,
    })),
    created_at: dish.createdAt?.toISOString?.() ?? dish.createdAt,
    updated_at: dish.updatedAt?.toISOString?.() ?? dish.updatedAt,
  };
}

async function serializeDish(dish, options = {}) {
  const includeComputed = options.includeComputed === true;
  const language = options.language || "en";
  const howToMake = includeComputed
    ? buildDishHowToMake(dish.menuItems || [], language)
    : undefined;
  const totalRequiredIngredients = includeComputed
    ? await resolveTotalRequiredIngredients(dish, language)
    : undefined;
  const stored = includeComputed
    ? readDishRequiredIngredientsStorage(dish.requiredIngredients)
    : { customized: false, items: [] };
  const savedRequiredIngredients = includeComputed ? stored.items : undefined;
  return {
    id: dish.id,
    business_id: dish.businessId,
    name: dish.name,
    price_per_plate: num(dish.pricePerPlate),
    is_template: dish.isTemplate,
    parent_dish_id: dish.parentDishId,
    menu_items: (dish.menuItems || []).map((row) => ({
      id: row.id,
      menu_item_id: row.menuItemId,
      quantity: row.quantity ?? 1,
      menu_item: row.menuItem
        ? {
            id: row.menuItem.id,
            name: resolveLocalizedName(row.menuItem.name, language),
            price_per_person: num(row.menuItem.pricePerPerson),
            category: {
              name: resolveLocalizedName(row.menuItem.category?.name, language),
              slug: row.menuItem.category?.slug ?? row.menuItem.categorySlug,
            },
            image_url: row.menuItem.imageUrl ?? null,
            how_to_make: row.menuItem.howToMake ?? null,
          }
        : undefined,
    })),
    ...(includeComputed
      ? {
          how_to_make: howToMake,
          total_required_ingredients: totalRequiredIngredients,
          saved_required_ingredients: savedRequiredIngredients,
          has_saved_required_ingredients:
            dish.requiredIngredientsCustomized === true || stored.customized,
        }
      : {}),
    created_at: dish.createdAt?.toISOString?.() ?? dish.createdAt,
    updated_at: dish.updatedAt?.toISOString?.() ?? dish.updatedAt,
  };
}

async function listDishes(req, res) {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;
    const q = String(req.query?.q ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query?.page ?? "1"), 10) || 1);
    const perPage = Math.min(
      50,
      Math.max(1, parseInt(String(req.query?.per_page ?? "10"), 10) || 10),
    );
    const where = {
      businessId,
      isTemplate: true,
      ...(q
        ? {
            name: {
              contains: q,
              mode: "insensitive",
            },
          }
        : {}),
    };
    const skip = (page - 1) * perPage;
    const [rows, total] = await Promise.all([
      prisma.dish.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: perPage,
        include: DISH_LIST_INCLUDE,
      }),
      prisma.dish.count({ where }),
    ]);
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    return successResponse(res, "OK", {
      items: rows.map((row) => serializeDishListItem(row, requestedLanguage)),
      pagination: {
        total,
        page,
        per_page: perPage,
        last_page: lastPage,
      },
    });
  } catch (e) {
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function getDish(req, res) {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;
    const id = req.params.id;
    const row = await prisma.dish.findFirst({
      where: { id, businessId },
      include: {
        menuItems: {
          include: { menuItem: { include: { category: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!row) return errorResponse(res, "Dish not found", 404, "NOT_FOUND");
    return successResponse(
      res,
      "OK",
      await serializeDish(row, { includeComputed: true, language: requestedLanguage }),
    );
  } catch (e) {
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function createDish(req, res) {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;
    const body = req.body || {};
    const name = String(body.name ?? "").trim();
    if (!name) return errorResponse(res, "Dish name required", 422, "VALIDATION_ERROR");
    const menuItems = Array.isArray(body.menu_items) ? body.menu_items : [];
    if (menuItems.length === 0) {
      return errorResponse(res, "Select at least one menu item", 422, "VALIDATION_ERROR");
    }
    const normalized = menuItems
      .map((row) => ({
        menuItemId: String(row.menu_item_id ?? row.menuItemId ?? "").trim(),
        quantity: Math.max(1, parseInt(String(row.quantity ?? 1), 10) || 1),
      }))
      .filter((row) => row.menuItemId);
    const ids = [...new Set(normalized.map((row) => row.menuItemId))];
    const existingMenus = await prisma.menuItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existingMenus.length !== ids.length) {
      return errorResponse(res, "Invalid menu item in dish", 422, "VALIDATION_ERROR");
    }
    const dish = await prisma.$transaction(async (tx) => {
      const created = await tx.dish.create({
        data: {
          businessId,
          name,
          pricePerPlate: new Prisma.Decimal(String(num(body.price_per_plate ?? 0))),
          isTemplate: body.is_template !== false,
          parentDishId: body.parent_dish_id ? String(body.parent_dish_id) : null,
        },
      });
      await tx.dishMenuItem.createMany({
        data: normalized.map((row) => ({
          dishId: created.id,
          menuItemId: row.menuItemId,
          quantity: row.quantity,
        })),
      });
      return tx.dish.findUnique({
        where: { id: created.id },
        include: {
          menuItems: {
            include: { menuItem: { include: { category: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    });
    return successResponse(res, "Dish created", await serializeDish(dish, { language: requestedLanguage }));
  } catch (e) {
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function updateDish(req, res) {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;
    const id = req.params.id;
    const body = req.body || {};
    const existing = await prisma.dish.findFirst({ where: { id, businessId } });
    if (!existing) return errorResponse(res, "Dish not found", 404, "NOT_FOUND");
    const name =
      body.name !== undefined ? String(body.name ?? "").trim() : existing.name;
    if (!name) return errorResponse(res, "Dish name required", 422, "VALIDATION_ERROR");
    const menuItems = Array.isArray(body.menu_items) ? body.menu_items : null;
    let requiredIngredientsUpdate;
    const requiredIngredientsBody =
      body.required_ingredients !== undefined
        ? body.required_ingredients
        : body.requiredIngredients;
    if (requiredIngredientsBody !== undefined) {
      if (!Array.isArray(requiredIngredientsBody)) {
        return errorResponse(
          res,
          "required_ingredients must be an array",
          422,
          "VALIDATION_ERROR",
        );
      }
      const normalized = normalizeDishRequiredIngredientsPayload(requiredIngredientsBody);
      if (normalized === null) {
        return errorResponse(
          res,
          "required_ingredients must be an array",
          422,
          "VALIDATION_ERROR",
        );
      }
      requiredIngredientsUpdate = normalized;
    }
    await prisma.$transaction(async (tx) => {
      await tx.dish.update({
        where: { id },
        data: {
          name,
          pricePerPlate:
            body.price_per_plate !== undefined
              ? new Prisma.Decimal(String(num(body.price_per_plate)))
              : existing.pricePerPlate,
          ...(requiredIngredientsUpdate !== undefined
            ? {
                requiredIngredients:
                  writeDishRequiredIngredientsStorage(requiredIngredientsUpdate),
                requiredIngredientsCustomized: true,
              }
            : {}),
        },
      });
      if (menuItems) {
        const normalized = menuItems
          .map((row) => ({
            menuItemId: String(row.menu_item_id ?? row.menuItemId ?? "").trim(),
            quantity: Math.max(1, parseInt(String(row.quantity ?? 1), 10) || 1),
          }))
          .filter((row) => row.menuItemId);
        await tx.dishMenuItem.deleteMany({ where: { dishId: id } });
        if (normalized.length) {
          await tx.dishMenuItem.createMany({
            data: normalized.map((row) => ({
              dishId: id,
              menuItemId: row.menuItemId,
              quantity: row.quantity,
            })),
          });
        }
      }
    });
    const updated = await prisma.dish.findUnique({
      where: { id },
      include: {
        menuItems: {
          include: { menuItem: { include: { category: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return successResponse(
      res,
      "Dish updated",
      await serializeDish(updated, { includeComputed: true, language: requestedLanguage }),
    );
  } catch (e) {
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function deleteDish(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const existing = await prisma.dish.findFirst({ where: { id, businessId } });
    if (!existing) return errorResponse(res, "Dish not found", 404, "NOT_FOUND");
    await prisma.dish.delete({ where: { id } });
    return successResponse(res, "Dish deleted", { id });
  } catch (e) {
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

module.exports = {
  listDishes,
  getDish,
  createDish,
  updateDish,
  deleteDish,
};

