const prisma = require("../config/prisma");
const { errorResponse } = require("../utils/response");

/**
 * Resolves business context for the request.
 * - If `x-business-id` is sent, it is used (for future multi-business support).
 * - Otherwise the user's single business is used from the JWT `businessId` claim or DB (`User.businessId`).
 */
module.exports = async (req, res, next) => {
  const userId = req.user?.userId;
  const headerRaw = req.headers["x-business-id"];

  try {
    let resolvedBusinessId = null;
    if (headerRaw && typeof headerRaw === "string" && headerRaw.trim()) {
      resolvedBusinessId = headerRaw.trim();
    } else {
      resolvedBusinessId = req.user?.businessId ?? null;
    }

    let userBusinessId = req.user?.businessId ?? null;
    const needsUserLookup =
      !resolvedBusinessId || resolvedBusinessId !== userBusinessId;

    if (needsUserLookup) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { businessId: true },
      });
      userBusinessId = user?.businessId ?? null;
      if (!resolvedBusinessId) {
        resolvedBusinessId = userBusinessId;
      }
    }

    if (!resolvedBusinessId) {
      return errorResponse(
        res,
        "No business context",
        422,
        "VALIDATION_ERROR",
        "Register a business first, or pass x-business-id when you have multiple businesses.",
      );
    }

    const business = await prisma.business.findUnique({
      where: { id: resolvedBusinessId },
      select: { id: true, createdByUserId: true },
    });

    if (!business) {
      return errorResponse(
        res,
        "Business not found",
        404,
        "NOT_FOUND",
        "No business exists for the given business context.",
      );
    }

    const allowed =
      business.createdByUserId === userId ||
      userBusinessId === resolvedBusinessId;

    if (!allowed) {
      return errorResponse(
        res,
        "You do not have access to this business",
        403,
        "FORBIDDEN",
        "The active business does not belong to your account.",
      );
    }

    req.businessId = resolvedBusinessId;
    next();
  } catch (err) {
    console.error("businessContextMiddleware error:", err.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }
};
