const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");

const TYPE_ALIASES = {
  admin_login: ["admin_login"],
  access_code: ["access_code"],
  payment: ["payment", "offline_payment"],
  notification: ["notification"],
};

function matchesTypeFilter(entryType, filter) {
  if (!filter || filter === "all") return true;
  const allowed = TYPE_ALIASES[filter];
  return allowed ? allowed.includes(entryType) : entryType === filter;
}

function matchesSearch(entry, q) {
  if (!q) return true;
  const hay = `${entry.message} ${entry.type}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function formatLogEntry({ id, type, message, created_at, meta }) {
  return { id, type, message, created_at, meta: meta ?? null };
}

async function collectLogEntries(typeFilter, q) {
  const perSource = 60;
  const entries = [];

  const activityWhere =
    typeFilter && typeFilter !== "all" && TYPE_ALIASES[typeFilter]
      ? { type: { in: TYPE_ALIASES[typeFilter] } }
      : {};

  const [activities, notifications, payments, usedCodes] = await Promise.all([
    prisma.activityLog.findMany({
      where: activityWhere,
      orderBy: { createdAt: "desc" },
      take: perSource,
    }),
    !typeFilter || typeFilter === "all" || typeFilter === "notification"
      ? prisma.notificationLog.findMany({
          orderBy: { createdAt: "desc" },
          take: perSource,
        })
      : [],
    !typeFilter || typeFilter === "all" || typeFilter === "payment"
      ? prisma.billingPaymentEvent.findMany({
          include: { business: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: perSource,
        })
      : [],
    !typeFilter || typeFilter === "all" || typeFilter === "access_code"
      ? prisma.accessCode.findMany({
          where: { usedAt: { not: null } },
          include: {
            assignedUser: {
              include: { business: { select: { name: true } } },
            },
          },
          orderBy: { usedAt: "desc" },
          take: perSource,
        })
      : [],
  ]);

  for (const row of activities) {
    entries.push(
      formatLogEntry({
        id: `activity-${row.id}`,
        type: row.type,
        message: row.message,
        created_at: row.createdAt.toISOString(),
        meta: row.meta,
      }),
    );
  }

  for (const row of notifications) {
    entries.push(
      formatLogEntry({
        id: `notification-${row.id}`,
        type: "notification",
        message: `Broadcast "${row.title}" to ${row.sentCount} user(s)`,
        created_at: row.createdAt.toISOString(),
        meta: { tokens_count: row.tokensCount, sent_to: row.sentTo },
      }),
    );
  }

  for (const row of payments) {
    const amount = Number(row.amountPaise) / 100;
    const businessName = row.business?.name ?? "Unknown business";
    entries.push(
      formatLogEntry({
        id: `payment-${row.id}`,
        type: "payment",
        message: `Payment ${row.status}: ₹${amount.toLocaleString("en-IN")} — ${businessName}`,
        created_at: row.createdAt.toISOString(),
        meta: {
          business_id: row.businessId,
          razorpay_payment_id: row.razorpayPaymentId,
        },
      }),
    );
  }

  for (const row of usedCodes) {
    const who =
      row.assignedUser?.business?.name ?? row.assignedUser?.name ?? "Unknown user";
    entries.push(
      formatLogEntry({
        id: `access-code-${row.id}`,
        type: "access_code",
        message: `Access code ${row.code} (${row.planType}) used by ${who}`,
        created_at: row.usedAt.toISOString(),
        meta: { code: row.code, plan_type: row.planType },
      }),
    );
  }

  return entries
    .filter((e) => matchesTypeFilter(e.type, typeFilter))
    .filter((e) => matchesSearch(e, q))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** GET /api/admin/v1/logs */
exports.listLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "30"), 10) || 30),
    );
    const typeFilter = String(req.query.type ?? "all").toLowerCase();
    const q = String(req.query.q ?? "").trim();

    const merged = await collectLogEntries(typeFilter, q);
    const total = merged.length;
    const skip = (page - 1) * limit;
    const logs = merged.slice(skip, skip + limit);

    return successResponse(res, "Logs", {
      logs,
      pagination: {
        page,
        limit,
        total,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("listLogs admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
