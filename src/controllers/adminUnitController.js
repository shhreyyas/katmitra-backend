const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");

function slugify(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "unit";
}

async function ensureUniqueSlug(base, excludeId) {
  const root = slugify(base);
  for (let n = 0; n < 10000; n += 1) {
    const candidate = n === 0 ? root : `${root}-${n}`;
    const existing = await prisma.unit.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (!existing) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function formatUnit(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** GET /api/admin/v1/units */
exports.listUnits = async (req, res) => {
  try {
    const search = String(req.query.q ?? "").trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};
    const rows = await prisma.unit.findMany({
      where,
      orderBy: [{ name: "asc" }],
      take: 500,
    });
    return successResponse(res, "Units", {
      units: rows.map(formatUnit),
    });
  } catch (error) {
    console.error("listUnits admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** POST /api/admin/v1/units */
exports.createUnit = async (req, res) => {
  try {
    const name = String(req.body.name ?? "").trim();
    if (!name) {
      return errorResponse(res, "name is required", 422, "VALIDATION_ERROR");
    }
    const slugInput = req.body.slug != null ? String(req.body.slug).trim() : "";
    const slug = await ensureUniqueSlug(slugInput || name);

    const row = await prisma.unit.create({
      data: { name, slug },
    });
    return successResponse(res, "Unit created", formatUnit(row), 201);
  } catch (error) {
    console.error("createUnit admin:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Unit slug already exists", 409, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PUT /api/admin/v1/units/:id */
exports.updateUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.unit.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Unit not found", 404, "NOT_FOUND");
    }

    const data = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) {
        return errorResponse(res, "name is required", 422, "VALIDATION_ERROR");
      }
      data.name = name;
    }
    if (req.body.slug !== undefined) {
      const slugInput = String(req.body.slug).trim();
      data.slug = slugInput
        ? await ensureUniqueSlug(slugInput, id)
        : await ensureUniqueSlug(data.name ?? existing.name, id);
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(res, "No fields to update", 422, "VALIDATION_ERROR");
    }

    const row = await prisma.unit.update({ where: { id }, data });
    return successResponse(res, "Unit updated", formatUnit(row));
  } catch (error) {
    console.error("updateUnit admin:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Unit slug already exists", 409, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** DELETE /api/admin/v1/units/:id */
exports.deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.unit.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Unit not found", 404, "NOT_FOUND");
    }

    const inUse = await prisma.supplyItem.findFirst({
      where: {
        OR: [
          { unitOptions: { has: existing.slug } },
          { defaultUnit: existing.slug },
        ],
      },
      select: { id: true },
    });
    if (inUse) {
      return errorResponse(
        res,
        "Cannot delete unit in use by supply items",
        409,
        "CONFLICT",
      );
    }

    await prisma.unit.delete({ where: { id } });
    return successResponse(res, "Unit deleted", { id });
  } catch (error) {
    console.error("deleteUnit admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
