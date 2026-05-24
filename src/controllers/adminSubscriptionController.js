const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");

function formatSubscription(row) {
  const business = row.business;
  const owner =
    business?.users?.find((u) => u.role === "owner") ?? business?.users?.[0];
  return {
    id: row.id,
    business_id: row.businessId,
    business_name: business?.name ?? "—",
    owner_name: owner?.name ?? business?.ownerName ?? "—",
    owner_user_id: owner?.id ?? null,
    owner_email: owner?.email ?? business?.email ?? null,
    plan_code: row.planCode ?? business?.subscriptionPlan ?? null,
    status: row.status,
    period_start: row.currentPeriodStart?.toISOString() ?? null,
    period_end: row.currentPeriodEnd?.toISOString() ?? null,
    razorpay_subscription_id: row.razorpaySubscriptionId,
    razorpay_plan_id: row.razorpayPlanId,
    cancel_at_period_end: row.cancelAtPeriodEnd,
    created_at: row.createdAt.toISOString(),
    business_status: business?.subscriptionStatus ?? null,
  };
}

function buildWhere(query) {
  const q = String(query.q ?? "").trim();
  const plan = String(query.plan ?? "all").trim();
  const status = String(query.status ?? "all").trim().toLowerCase();

  const where = {};
  if (status !== "all") {
    where.status = { contains: status, mode: "insensitive" };
  }
  if (plan !== "all") {
    where.planCode = { contains: plan, mode: "insensitive" };
  }
  if (q) {
    where.OR = [
      { razorpaySubscriptionId: { contains: q, mode: "insensitive" } },
      { business: { name: { contains: q, mode: "insensitive" } } },
      { business: { ownerName: { contains: q, mode: "insensitive" } } },
      { business: { email: { contains: q, mode: "insensitive" } } },
      {
        business: {
          users: {
            some: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        },
      },
    ];
  }
  return where;
}

async function syncBusinessSubscription(businessId, sub) {
  if (!businessId || !sub) return;
  await prisma.business.update({
    where: { id: businessId },
    data: {
      subscriptionPlan: sub.planCode ?? undefined,
      subscriptionStatus: sub.status,
      subscriptionStart: sub.currentPeriodStart ?? undefined,
      subscriptionEnd: sub.currentPeriodEnd ?? undefined,
    },
  });
}

exports.listSubscriptions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;
    const where = buildWhere(req.query);

    const [total, rows] = await prisma.$transaction([
      prisma.billingSubscription.count({ where }),
      prisma.billingSubscription.findMany({
        where,
        include: {
          business: {
            include: {
              users: {
                where: { deletedAt: null, role: { not: "admin" } },
                take: 3,
              },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return successResponse(res, "Subscriptions", {
      subscriptions: rows.map(formatSubscription),
      pagination: {
        page,
        limit,
        total,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("listSubscriptions admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.getSubscription = async (req, res) => {
  try {
    const row = await prisma.billingSubscription.findUnique({
      where: { id: req.params.id },
      include: {
        business: {
          include: { users: { where: { deletedAt: null }, take: 5 } },
        },
        paymentEvents: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!row) {
      return errorResponse(res, "Subscription not found", 404, "NOT_FOUND");
    }
    return successResponse(res, "Subscription", {
      subscription: formatSubscription(row),
      payments: row.paymentEvents.map((p) => ({
        id: p.id,
        amount: Number(p.amountPaise) / 100,
        status: p.status,
        razorpay_payment_id: p.razorpayPaymentId,
        created_at: p.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("getSubscription admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.updateSubscription = async (req, res) => {
  try {
    const existing = await prisma.billingSubscription.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return errorResponse(res, "Subscription not found", 404, "NOT_FOUND");
    }

    const data = {};
    if (req.body.status !== undefined) {
      data.status = String(req.body.status).trim().toLowerCase();
    }
    if (req.body.plan_code !== undefined) {
      data.planCode = String(req.body.plan_code).trim().toUpperCase();
    }
    if (req.body.cancel_at_period_end !== undefined) {
      data.cancelAtPeriodEnd = Boolean(req.body.cancel_at_period_end);
    }
    if (req.body.period_end !== undefined) {
      data.currentPeriodEnd = req.body.period_end
        ? new Date(req.body.period_end)
        : null;
    } else if (req.body.months !== undefined) {
      const m = Math.max(1, parseInt(String(req.body.months), 10) || 1);
      const end = new Date();
      end.setMonth(end.getMonth() + m);
      data.currentPeriodEnd = end;
      if (!existing.currentPeriodStart) {
        data.currentPeriodStart = new Date();
      }
      if (!data.status) {
        data.status = "active";
      }
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(res, "No fields to update", 422, "VALIDATION_ERROR");
    }

    const row = await prisma.billingSubscription.update({
      where: { id: existing.id },
      data,
      include: {
        business: {
          include: { users: { where: { deletedAt: null }, take: 3 } },
        },
      },
    });

    await syncBusinessSubscription(row.businessId, row);

    return successResponse(res, "Subscription updated", formatSubscription(row));
  } catch (error) {
    console.error("updateSubscription admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
