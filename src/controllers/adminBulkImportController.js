const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { normalizeLocalizedName } = require("../utils/localization");

const VALID_TYPES = new Set([
  "menu_categories",
  "supply_categories",
  "menu_items",
  "supply_items",
]);

const FOOD_TYPES = new Set(["veg", "non_veg"]);
const SUPPLY_TYPES = new Set(["INGREDIENT", "UTENSIL"]);
const MAX_ROWS = 500;

const IMPORT_SCHEMAS = {
  menu_categories: {
    label: "Menu Categories",
    fields: [
      { key: "name_en", label: "Name (English)", required: true },
      { key: "name_hi", label: "Name (Hindi)", required: true },
      { key: "name_gu", label: "Name (Gujarati / Kutchi)", required: true },
      { key: "slug", label: "Slug", required: false },
      { key: "sort_order", label: "Sort order", required: false },
      { key: "is_active", label: "Active (true/false)", required: false },
    ],
    template_headers: [
      "name_en",
      "name_hi",
      "name_gu",
      "slug",
      "sort_order",
      "is_active",
    ],
    template_example: [
      ["Starters", "स्टार्टर", "સ્ટાર્ટર", "starters", "1", "true"],
    ],
  },
  supply_categories: {
    label: "Supply Categories",
    fields: [
      { key: "name_en", label: "Name (English)", required: true },
      { key: "name_hi", label: "Name (Hindi)", required: true },
      { key: "name_gu", label: "Name (Gujarati / Kutchi)", required: true },
      { key: "slug", label: "Slug", required: false },
      { key: "sort_order", label: "Sort order", required: false },
      { key: "is_active", label: "Active (true/false)", required: false },
    ],
    template_headers: [
      "name_en",
      "name_hi",
      "name_gu",
      "slug",
      "sort_order",
      "is_active",
    ],
    template_example: [
      ["Vegetables", "सब्जियां", "શાકભાજી", "vegetables", "1", "true"],
    ],
  },
  menu_items: {
    label: "Menu Items",
    fields: [
      { key: "name_en", label: "Name (English)", required: true },
      { key: "name_hi", label: "Name (Hindi)", required: true },
      { key: "name_gu", label: "Name (Gujarati / Kutchi)", required: true },
      { key: "category_slug", label: "Category slug", required: true },
      { key: "price_per_person", label: "Price per person", required: true },
      { key: "food_type", label: "Food type (veg / non_veg)", required: true },
      { key: "scope", label: "Scope (global / business)", required: false },
      { key: "business_id", label: "Business ID (if business scope)", required: false },
      { key: "description", label: "Description", required: false },
      { key: "image_url", label: "Image URL", required: false },
    ],
    template_headers: [
      "name_en",
      "name_hi",
      "name_gu",
      "category_slug",
      "price_per_person",
      "food_type",
      "scope",
      "business_id",
      "description",
      "image_url",
    ],
    template_example: [
      [
        "Paneer Tikka",
        "पनीर टिक्का",
        "પનીર ટિક્કા",
        "starters",
        "120",
        "veg",
        "global",
        "",
        "",
        "",
      ],
    ],
  },
  supply_items: {
    label: "Supply Items",
    fields: [
      { key: "name_en", label: "Name (English)", required: true },
      { key: "name_hi", label: "Name (Hindi)", required: true },
      { key: "name_gu", label: "Name (Gujarati / Kutchi)", required: true },
      { key: "type", label: "Type (INGREDIENT / UTENSIL)", required: true },
      { key: "category_slug", label: "Category slug", required: true },
      { key: "unit_options", label: "Unit slugs (comma-separated)", required: true },
      { key: "default_unit", label: "Default unit slug", required: true },
      { key: "scope", label: "Scope (global / business)", required: false },
      { key: "business_id", label: "Business ID", required: false },
      { key: "available_count", label: "Available count (utensils)", required: false },
      { key: "photo_url", label: "Photo URL", required: false },
    ],
    template_headers: [
      "name_en",
      "name_hi",
      "name_gu",
      "type",
      "category_slug",
      "unit_options",
      "default_unit",
      "scope",
      "business_id",
      "available_count",
      "photo_url",
    ],
    template_example: [
      [
        "Tomato",
        "टमाटर",
        "ટામેટા",
        "INGREDIENT",
        "vegetables",
        "kg,g",
        "kg",
        "global",
        "",
        "",
        "",
      ],
    ],
  },
};

function slugify(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "item";
}

async function ensureUniqueCategorySlug(model, base, excludeId) {
  const root = slugify(base);
  for (let n = 0; n < 10000; n += 1) {
    const candidate = n === 0 ? root : `${root}-${n}`;
    const existing = await model.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (!existing) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function deriveIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

function cell(row, mapping, key) {
  const col = mapping[key];
  if (!col) return "";
  return String(row[col] ?? "").trim();
}

function localizedFromRow(row, mapping) {
  return normalizeLocalizedName({
    en: cell(row, mapping, "name_en"),
    hi: cell(row, mapping, "name_hi"),
    gu: cell(row, mapping, "name_gu"),
  });
}

function parseBool(raw, defaultValue = true) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return defaultValue;
  if (["0", "false", "no", "inactive"].includes(s)) return false;
  return true;
}

function parseScope(row, mapping) {
  const scopeRaw = cell(row, mapping, "scope").toLowerCase();
  const businessId = cell(row, mapping, "business_id");
  if (scopeRaw === "business" || scopeRaw === "business_only" || businessId) {
    if (!businessId) {
      return { error: "business_id is required when scope is business" };
    }
    return { businessId };
  }
  return { businessId: null };
}

function normalizeFoodType(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (s === "nonveg" || s === "non-veg") return "non_veg";
  if (FOOD_TYPES.has(s)) return s;
  return null;
}

function normalizeSupplyType(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  return SUPPLY_TYPES.has(s) ? s : null;
}

function toCsvLine(values) {
  return values
    .map((v) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    })
    .join(",");
}

/** GET /api/admin/v1/bulk-import/schemas */
exports.listSchemas = async (req, res) => {
  return successResponse(res, "Import schemas", {
    types: Object.entries(IMPORT_SCHEMAS).map(([type, schema]) => ({
      type,
      label: schema.label,
      fields: schema.fields,
    })),
  });
};

/** GET /api/admin/v1/bulk-import/templates/:type */
exports.downloadTemplate = async (req, res) => {
  const type = String(req.params.type || "").toLowerCase();
  const schema = IMPORT_SCHEMAS[type];
  if (!schema) {
    return errorResponse(res, "Invalid import type", 422, "VALIDATION_ERROR");
  }
  const lines = [
    toCsvLine(schema.template_headers),
    ...schema.template_example.map((row) => toCsvLine(row)),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${type}-template.csv"`,
  );
  return res.send(lines.join("\n"));
};

async function importMenuCategories(rows, mapping, options) {
  const result = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const skipDupes = options.skip_duplicates !== false;

  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 1;
    const row = rows[i];
    try {
      const name = localizedFromRow(row, mapping);
      if (!name) {
        throw new Error("name_en, name_hi, and name_gu are required");
      }
      const slugInput = cell(row, mapping, "slug");
      const slug = slugInput
        ? slugify(slugInput)
        : await ensureUniqueCategorySlug(prisma.menuCategory, name.en);

      if (skipDupes) {
        const dup = await prisma.menuCategory.findUnique({ where: { slug } });
        if (dup) {
          result.skipped += 1;
          continue;
        }
      }

      await prisma.menuCategory.create({
        data: {
          name,
          slug,
          sortOrder: Number(cell(row, mapping, "sort_order")) || 0,
          isActive: parseBool(cell(row, mapping, "is_active"), true),
        },
      });
      result.imported += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push({ row: rowNum, message: e.message || "Import failed" });
    }
  }
  return result;
}

async function importSupplyCategories(rows, mapping, options) {
  const result = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const skipDupes = options.skip_duplicates !== false;

  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 1;
    const row = rows[i];
    try {
      const name = localizedFromRow(row, mapping);
      if (!name) {
        throw new Error("name_en, name_hi, and name_gu are required");
      }
      const slugInput = cell(row, mapping, "slug");
      const slug = slugInput
        ? slugify(slugInput)
        : await ensureUniqueCategorySlug(prisma.supplyItemCategory, name.en);

      if (skipDupes) {
        const dup = await prisma.supplyItemCategory.findUnique({ where: { slug } });
        if (dup) {
          result.skipped += 1;
          continue;
        }
      }

      await prisma.supplyItemCategory.create({
        data: {
          name,
          slug,
          sortOrder: Number(cell(row, mapping, "sort_order")) || 0,
          isActive: parseBool(cell(row, mapping, "is_active"), true),
        },
      });
      result.imported += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push({ row: rowNum, message: e.message || "Import failed" });
    }
  }
  return result;
}

async function importMenuItems(rows, mapping, options, adminUserId) {
  const result = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const skipDupes = options.skip_duplicates !== false;

  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 1;
    const row = rows[i];
    try {
      const name = localizedFromRow(row, mapping);
      if (!name) throw new Error("Localized names are required");

      const categorySlug = cell(row, mapping, "category_slug").toLowerCase();
      if (!categorySlug) throw new Error("category_slug is required");

      const category = await prisma.menuCategory.findUnique({
        where: { slug: categorySlug },
      });
      if (!category) throw new Error(`Unknown category_slug: ${categorySlug}`);

      const foodType = normalizeFoodType(cell(row, mapping, "food_type"));
      if (!foodType) throw new Error("food_type must be veg or non_veg");

      const price = Number(cell(row, mapping, "price_per_person"));
      if (!Number.isFinite(price) || price < 0) {
        throw new Error("Invalid price_per_person");
      }

      const scopeResult = parseScope(row, mapping);
      if (scopeResult.error) throw new Error(scopeResult.error);
      const { businessId } = scopeResult;

      if (businessId) {
        const biz = await prisma.business.findUnique({ where: { id: businessId } });
        if (!biz) throw new Error("Business not found");
      }

      if (skipDupes) {
        const dup = await prisma.menuItem.findFirst({
          where: {
            categorySlug,
            name: { path: ["en"], equals: name.en },
            businessId: businessId ?? null,
          },
        });
        if (dup) {
          result.skipped += 1;
          continue;
        }
      }

      await prisma.menuItem.create({
        data: {
          name,
          categorySlug,
          foodType,
          pricePerPerson: new Prisma.Decimal(String(price)),
          businessId,
          createdByUserId: adminUserId,
          isGlobal: deriveIsGlobal(businessId, adminUserId),
          description: cell(row, mapping, "description") || null,
          imageUrl: cell(row, mapping, "image_url") || null,
          ingredients: [],
        },
      });
      result.imported += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push({ row: rowNum, message: e.message || "Import failed" });
    }
  }
  return result;
}

async function importSupplyItems(rows, mapping, options, adminUserId) {
  const result = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const skipDupes = options.skip_duplicates !== false;

  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 1;
    const row = rows[i];
    try {
      const name = localizedFromRow(row, mapping);
      if (!name) throw new Error("Localized names are required");

      const type = normalizeSupplyType(cell(row, mapping, "type"));
      if (!type) throw new Error("type must be INGREDIENT or UTENSIL");

      const categorySlug = cell(row, mapping, "category_slug").toLowerCase();
      if (!categorySlug) throw new Error("category_slug is required");

      const category = await prisma.supplyItemCategory.findFirst({
        where: { slug: categorySlug },
      });
      if (!category) throw new Error(`Unknown category_slug: ${categorySlug}`);

      const unitOptions = cell(row, mapping, "unit_options")
        .split(/[,|]/)
        .map((u) => u.trim().toLowerCase())
        .filter(Boolean);
      const defaultUnit = cell(row, mapping, "default_unit").toLowerCase();
      if (!unitOptions.length || !defaultUnit || !unitOptions.includes(defaultUnit)) {
        throw new Error("unit_options and default_unit must be valid");
      }

      const scopeResult = parseScope(row, mapping);
      if (scopeResult.error) throw new Error(scopeResult.error);
      const { businessId } = scopeResult;

      if (businessId) {
        const biz = await prisma.business.findUnique({ where: { id: businessId } });
        if (!biz) throw new Error("Business not found");
      }

      if (skipDupes) {
        const dup = await prisma.supplyItem.findFirst({
          where: {
            categorySlug,
            type,
            name: { path: ["en"], equals: name.en },
            businessId: businessId ?? null,
          },
        });
        if (dup) {
          result.skipped += 1;
          continue;
        }
      }

      const availableRaw = cell(row, mapping, "available_count");
      const availableCount =
        availableRaw === "" ? null : Math.max(0, parseInt(availableRaw, 10) || 0);

      await prisma.supplyItem.create({
        data: {
          name,
          type,
          categorySlug,
          unitOptions,
          defaultUnit,
          businessId,
          createdByUserId: adminUserId,
          isGlobal: deriveIsGlobal(businessId, adminUserId),
          availableCount: type === "UTENSIL" ? availableCount : null,
          damagedCount: 0,
          photoUrl: cell(row, mapping, "photo_url") || null,
          isActive: true,
        },
      });
      result.imported += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push({ row: rowNum, message: e.message || "Import failed" });
    }
  }
  return result;
}

/** POST /api/admin/v1/bulk-import */
exports.runBulkImport = async (req, res) => {
  try {
    const adminUserId = req.user.userId;
    const type = String(req.body.type || "").toLowerCase();
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const mapping =
      req.body.mapping && typeof req.body.mapping === "object" ? req.body.mapping : {};
    const options =
      req.body.options && typeof req.body.options === "object" ? req.body.options : {};

    if (!VALID_TYPES.has(type)) {
      return errorResponse(res, "Invalid import type", 422, "VALIDATION_ERROR");
    }
    if (!rows.length) {
      return errorResponse(res, "No rows to import", 422, "VALIDATION_ERROR");
    }
    if (rows.length > MAX_ROWS) {
      return errorResponse(
        res,
        `Maximum ${MAX_ROWS} rows per import`,
        422,
        "VALIDATION_ERROR",
      );
    }

    const requiredFields = (IMPORT_SCHEMAS[type].fields || [])
      .filter((f) => f.required)
      .map((f) => f.key);
    for (const field of requiredFields) {
      if (!mapping[field]) {
        return errorResponse(
          res,
          `Missing column mapping for ${field}`,
          422,
          "VALIDATION_ERROR",
        );
      }
    }

    let result;
    if (type === "menu_categories") {
      result = await importMenuCategories(rows, mapping, options);
    } else if (type === "supply_categories") {
      result = await importSupplyCategories(rows, mapping, options);
    } else if (type === "menu_items") {
      result = await importMenuItems(rows, mapping, options, adminUserId);
    } else if (type === "supply_items") {
      result = await importSupplyItems(rows, mapping, options, adminUserId);
    }

    return successResponse(res, "Import complete", {
      type,
      ...result,
      total_rows: rows.length,
    });
  } catch (error) {
    console.error("runBulkImport:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
