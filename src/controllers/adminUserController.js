const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { logActivity } = require("../utils/activityLog");
const { formatBusinessDetail } = require("./authController");

function derivePlanLabel(business) {
  if (!business) return "FREE";
  const status = String(business.subscriptionStatus ?? "").toLowerCase();
  const plan = String(business.subscriptionPlan ?? "FREE").toUpperCase();
  const end = business.subscriptionEnd ? new Date(business.subscriptionEnd) : null;
  const expiredByDate = end && end < new Date() && status !== "trial";
  if (status === "expired" || expiredByDate) return "EXPIRED";
  if (status === "trial") return "TRIAL";
  if (plan === "FREE") return "FREE";
  return plan;
}

function formatUserListRow(user) {
  const business = user.business;
  return {
    id: user.id,
    business_id: business?.id ?? null,
    business_name: business?.name ?? "—",
    owner_name: user.name || business?.ownerName || "—",
    phone: user.phoneNumber || business?.contactNumber || "—",
    email: user.email,
    plan_type: derivePlanLabel(business),
    expiry_date: business?.subscriptionEnd
      ? business.subscriptionEnd.toISOString().split("T")[0]
      : null,
    status: user.deletedAt ? "suspended" : "active",
    subscription_status: business?.subscriptionStatus ?? null,
    subscription_plan: business?.subscriptionPlan ?? null,
    created_at: user.createdAt.toISOString(),
  };
}

function buildUserListWhere(query) {
  const q = String(query.q ?? "").trim();
  const plan = String(query.plan ?? "all").toLowerCase();
  const status = String(query.status ?? "all").toLowerCase();

  const where = {
    role: { not: "admin" },
    businessId: { not: null },
  };

  if (status === "active") where.deletedAt = null;
  if (status === "suspended") where.deletedAt = { not: null };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phoneNumber: { contains: q, mode: "insensitive" } },
      { business: { name: { contains: q, mode: "insensitive" } } },
      { business: { ownerName: { contains: q, mode: "insensitive" } } },
      { business: { contactNumber: { contains: q, mode: "insensitive" } } },
    ];
  }

  const businessFilter = {};
  if (plan === "free") {
    businessFilter.subscriptionPlan = "FREE";
    businessFilter.subscriptionStatus = { not: "trial" };
  } else if (plan === "trial") {
    businessFilter.subscriptionStatus = "trial";
  } else if (plan === "subscribed") {
    businessFilter.subscriptionStatus = "active";
    businessFilter.subscriptionPlan = { not: "FREE" };
  } else if (plan === "expired") {
    businessFilter.OR = [
      { subscriptionStatus: "expired" },
      {
        subscriptionEnd: { lt: new Date() },
        subscriptionStatus: { not: "trial" },
      },
    ];
  }

  if (Object.keys(businessFilter).length > 0) {
    where.business = businessFilter;
  }

  return where;
}

/** GET /api/admin/v1/users */
exports.listUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;
    const where = buildUserListWhere(req.query);

    const [total, rows] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { business: true },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return successResponse(res, "Users", {
      users: rows.map(formatUserListRow),
      pagination: {
        page,
        limit,
        total,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("listUsers admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** GET /api/admin/v1/users/:id */
exports.getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        business: {
          include: {
            serviceLinks: { include: { serviceType: true } },
          },
        },
      },
    });

    if (!user || user.role === "admin") {
      return errorResponse(res, "User not found", 404, "NOT_FOUND");
    }

    const businessId = user.businessId;
    let subscriptions = [];
    let payments = [];

    if (businessId) {
      subscriptions = await prisma.billingSubscription.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      payments = await prisma.billingPaymentEvent.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
    }

    return successResponse(res, "User detail", {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phoneNumber,
        role: user.role,
        is_verified: user.isVerified,
        status: user.deletedAt ? "suspended" : "active",
        created_at: user.createdAt.toISOString(),
        last_login_at: user.updatedAt?.toISOString() ?? null,
      },
      business: user.business ? formatBusinessDetail(user.business) : null,
      plan_type: derivePlanLabel(user.business),
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        plan_code: s.planCode,
        status: s.status,
        period_start: s.currentPeriodStart?.toISOString() ?? null,
        period_end: s.currentPeriodEnd?.toISOString() ?? null,
        razorpay_subscription_id: s.razorpaySubscriptionId,
        created_at: s.createdAt.toISOString(),
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amountPaise) / 100,
        status: p.status,
        razorpay_payment_id: p.razorpayPaymentId,
        created_at: p.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("getUser admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PATCH /api/admin/v1/users/:id/suspend */
exports.setUserSuspended = async (req, res) => {
  try {
    const { id } = req.params;
    const suspend = req.body.suspend !== false;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role === "admin") {
      return errorResponse(res, "User not found", 404, "NOT_FOUND");
    }

    await prisma.user.update({
      where: { id },
      data: { deletedAt: suspend ? new Date() : null },
    });

    return successResponse(res, suspend ? "User suspended" : "User reactivated", {
      id,
      status: suspend ? "suspended" : "active",
    });
  } catch (error) {
    console.error("setUserSuspended admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PATCH /api/admin/v1/users/:id/subscription */
exports.updateUserSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: { business: true },
    });
    if (!user?.businessId || !user.business) {
      return errorResponse(res, "User has no business", 404, "NOT_FOUND");
    }

    const { plan, months, end_date, status } = req.body;
    const data = {};

    if (plan !== undefined) {
      data.subscriptionPlan = String(plan).trim().toUpperCase();
    }
    if (status !== undefined) {
      data.subscriptionStatus = String(status).trim().toLowerCase();
    }
    if (end_date !== undefined) {
      data.subscriptionEnd = end_date ? new Date(end_date) : null;
    } else if (months !== undefined) {
      const m = Math.max(1, parseInt(String(months), 10) || 1);
      const end = new Date();
      end.setMonth(end.getMonth() + m);
      data.subscriptionEnd = end;
      if (!user.business.subscriptionStart) {
        data.subscriptionStart = new Date();
      }
      if (!data.subscriptionStatus) {
        data.subscriptionStatus = "active";
      }
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(res, "No fields to update", 422, "VALIDATION_ERROR");
    }

    const business = await prisma.business.update({
      where: { id: user.businessId },
      data,
    });

    return successResponse(res, "Subscription updated", {
      business_id: business.id,
      plan_type: derivePlanLabel(business),
      subscription: {
        status: business.subscriptionStatus,
        plan: business.subscriptionPlan,
        end: business.subscriptionEnd?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("updateUserSubscription admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** POST /api/admin/v1/users/:id/offline-payment */
exports.recordOfflinePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user?.businessId) {
      return errorResponse(res, "User has no business", 404, "NOT_FOUND");
    }

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return errorResponse(res, "Valid amount is required", 422, "VALIDATION_ERROR");
    }

    const method = String(req.body.method ?? "offline").trim();
    const transactionId = String(req.body.transaction_id ?? "").trim();
    const notes = String(req.body.notes ?? "").trim();
    const amountPaise = BigInt(Math.round(amount * 100));

    const row = await prisma.billingPaymentEvent.create({
      data: {
        businessId: user.businessId,
        amountPaise,
        status: "captured",
        razorpayPaymentId: transactionId
          ? `offline_${transactionId}`
          : `offline_${Date.now()}`,
        rawWebhookEventId: notes ? `admin:${notes}` : `admin:offline:${method}`,
      },
    });

    logActivity({
      type: "offline_payment",
      message: `Offline payment ₹${amount} recorded for user ${user.email}`,
      actorUserId: req.user?.userId ?? null,
      meta: { user_id: user.id, business_id: user.businessId, payment_id: row.id },
    });

    return successResponse(res, "Payment recorded", {
      id: row.id,
      amount: Number(row.amountPaise) / 100,
      created_at: row.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("recordOfflinePayment admin:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Duplicate transaction id", 409, "DUPLICATE");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
