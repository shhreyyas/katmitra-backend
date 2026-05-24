const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getRequestedLanguage,
  resolveLocalizedName,
} = require("../utils/localization");

function formatAdminCategory(row, requestedLanguage = "en") {
  return {
    id: row.id,
    name: resolveLocalizedName(row.name, requestedLanguage),
    name_i18n: row.name,
    slug: row.slug,
    sort_order: row.sortOrder,
    is_active: row.isActive,
    menu_items_count: row._count?.menuItems ?? 0,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** GET /api/admin/v1/dashboard */
exports.getDashboard = async (req, res) => {
  try {
    const [
      totalUsers,
      activeSubscriptions,
      expiredBusinesses,
      totalBookings,
      totalQuotations,
      openContactMessages,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null, role: { not: "admin" } } }),
      prisma.business.count({
        where: {
          subscriptionStatus: { in: ["active", "trial"] },
        },
      }),
      prisma.business.count({
        where: {
          OR: [
            { subscriptionStatus: "expired" },
            {
              subscriptionEnd: { lt: new Date() },
              subscriptionStatus: { not: "trial" },
            },
          ],
        },
      }),
      prisma.booking.count(),
      prisma.quotation.count(),
      prisma.contactMessage.count({ where: { status: "open" } }),
    ]);

    const revenueAgg = await prisma.billingPaymentEvent.aggregate({
      _sum: { amountPaise: true },
    });

    const totalRevenuePaise = revenueAgg._sum.amountPaise ?? BigInt(0);
    const totalRevenue = Number(totalRevenuePaise) / 100;

    return successResponse(res, "Dashboard stats", {
      total_users: totalUsers,
      active_subscriptions: activeSubscriptions,
      expired_users: expiredBusinesses,
      total_revenue: totalRevenue,
      total_bookings: totalBookings,
      total_quotations: totalQuotations,
      open_support_messages: openContactMessages,
    });
  } catch (error) {
    console.error("getDashboard error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** GET /api/admin/v1/menu-categories — all categories (active + inactive) */
exports.listMenuCategories = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const status = String(req.query.status || "all").toLowerCase();

    const where = {};
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    const rows = await prisma.menuCategory.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      include: { _count: { select: { menuItems: true } } },
    });

    return successResponse(res, "Menu categories", {
      categories: rows.map((row) => formatAdminCategory(row, requestedLanguage)),
    });
  } catch (error) {
    console.error("listMenuCategories admin error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

function formatAdminSupplyCategory(row, requestedLanguage = "en") {
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

/** GET /api/admin/v1/supply-categories — all categories (active + inactive) */
exports.listSupplyCategories = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const status = String(req.query.status || "all").toLowerCase();

    const where = {};
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    const rows = await prisma.supplyItemCategory.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      include: { _count: { select: { supplyItems: true } } },
    });

    return successResponse(res, "Supply categories", {
      categories: rows.map((row) =>
        formatAdminSupplyCategory(row, requestedLanguage),
      ),
    });
  } catch (error) {
    console.error("listSupplyCategories admin error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
