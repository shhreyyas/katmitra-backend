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
  return s || "service";
}

async function ensureUniqueSlug(base, excludeId) {
  const root = slugify(base);
  for (let n = 0; n < 10000; n += 1) {
    const candidate = n === 0 ? root : `${root}-${n}`;
    const existing = await prisma.serviceType.findFirst({
      where: {
        slug: candidate,
        ...(excludeId != null ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (!existing) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function formatServiceType(row, language = "en") {
  return {
    id: row.id,
    name: resolveLocalizedName(row.name, language),
    name_i18n: row.name,
    slug: row.slug,
    icon: row.icon ?? null,
    status: row.status,
    is_active: row.status === 1,
    businesses_count: row._count?.businesses ?? 0,
  };
}

function parseStatus(body) {
  if (body.is_active !== undefined) {
    return body.is_active === true || body.is_active === 1 ? 1 : 0;
  }
  if (body.status !== undefined) {
    return Number(body.status) === 0 ? 0 : 1;
  }
  return undefined;
}

/** GET /api/admin/v1/service-types */
exports.listServiceTypes = async (req, res) => {
  try {
    const language = getRequestedLanguage(req);
    const statusFilter = String(req.query.status ?? "all").toLowerCase();
    const search = String(req.query.q ?? "").trim();

    const where = {};
    if (statusFilter === "active") where.status = 1;
    if (statusFilter === "inactive") where.status = 0;

    let rows = await prisma.serviceType.findMany({
      where,
      orderBy: { id: "asc" },
      include: { _count: { select: { businesses: true } } },
    });

    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) => {
        const en = String(r.name?.en ?? "").toLowerCase();
        const hi = String(r.name?.hi ?? "").toLowerCase();
        const gu = String(r.name?.gu ?? "").toLowerCase();
        const slug = String(r.slug ?? "").toLowerCase();
        return (
          en.includes(s) ||
          hi.includes(s) ||
          gu.includes(s) ||
          slug.includes(s)
        );
      });
    }

    return successResponse(res, "Service types", {
      service_types: rows.map((r) => formatServiceType(r, language)),
    });
  } catch (error) {
    console.error("listServiceTypes admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** POST /api/admin/v1/service-types */
exports.createServiceType = async (req, res) => {
  try {
    const language = getRequestedLanguage(req);
    const normalizedName = normalizeLocalizedName(req.body.name);
    if (!normalizedName) {
      return errorResponse(res, "name is required", 422, "VALIDATION_ERROR");
    }

    const slugInput = req.body.slug != null ? String(req.body.slug).trim() : "";
    const slug = await ensureUniqueSlug(slugInput || normalizedName.en);
    const status = parseStatus(req.body);
    const icon =
      typeof req.body.icon === "string" && req.body.icon.trim()
        ? req.body.icon.trim()
        : null;

    const row = await prisma.serviceType.create({
      data: {
        name: normalizedName,
        slug,
        icon,
        status: status !== undefined ? status : 1,
      },
      include: { _count: { select: { businesses: true } } },
    });

    return successResponse(
      res,
      "Service type created",
      formatServiceType(row, language),
      201,
    );
  } catch (error) {
    console.error("createServiceType admin:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Service type slug already exists", 409, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PUT /api/admin/v1/service-types/:id */
exports.updateServiceType = async (req, res) => {
  try {
    const language = getRequestedLanguage(req);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      return errorResponse(res, "Invalid id", 422, "VALIDATION_ERROR");
    }

    const existing = await prisma.serviceType.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, "Service type not found", 404, "NOT_FOUND");
    }

    const data = {};
    if (req.body.name !== undefined) {
      const normalizedName = normalizeLocalizedName(req.body.name);
      if (!normalizedName) {
        return errorResponse(res, "Invalid name", 422, "VALIDATION_ERROR");
      }
      data.name = normalizedName;
    }
    if (req.body.slug !== undefined) {
      const slugInput = String(req.body.slug).trim();
      data.slug = slugInput
        ? await ensureUniqueSlug(slugInput, id)
        : await ensureUniqueSlug(
            data.name
              ? resolveLocalizedName(data.name, "en")
              : resolveLocalizedName(existing.name, "en"),
            id,
          );
    }
    if (req.body.icon !== undefined) {
      data.icon =
        typeof req.body.icon === "string" && req.body.icon.trim()
          ? req.body.icon.trim()
          : null;
    }
    const status = parseStatus(req.body);
    if (status !== undefined) {
      data.status = status;
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(res, "No fields to update", 422, "VALIDATION_ERROR");
    }

    const row = await prisma.serviceType.update({
      where: { id },
      data,
      include: { _count: { select: { businesses: true } } },
    });

    return successResponse(
      res,
      "Service type updated",
      formatServiceType(row, language),
    );
  } catch (error) {
    console.error("updateServiceType admin:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Service type slug already exists", 409, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** DELETE /api/admin/v1/service-types/:id */
exports.deleteServiceType = async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      return errorResponse(res, "Invalid id", 422, "VALIDATION_ERROR");
    }

    const existing = await prisma.serviceType.findUnique({
      where: { id },
      include: { _count: { select: { businesses: true } } },
    });
    if (!existing) {
      return errorResponse(res, "Service type not found", 404, "NOT_FOUND");
    }
    if (existing._count.businesses > 0) {
      return errorResponse(
        res,
        "Cannot delete service type linked to businesses",
        409,
        "CONFLICT",
      );
    }

    await prisma.serviceType.delete({ where: { id } });
    return successResponse(res, "Service type deleted", { id });
  } catch (error) {
    console.error("deleteServiceType admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
