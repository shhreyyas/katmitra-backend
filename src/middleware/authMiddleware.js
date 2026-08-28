const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const { errorResponse } = require("../utils/response");

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return errorResponse(res, "Missing or invalid auth token", 401, "UNAUTHORIZED");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return errorResponse(res, "Missing or invalid auth token", 401, "UNAUTHORIZED");
  }

  // ── Single-device enforcement ──────────────────────────────────────────
  // Every login increments sessionVersion in the DB and embeds the new
  // value in the issued JWT. If the user has logged in on another device
  // since this token was issued, the DB version will be higher and this
  // request is rejected — effectively auto-logging out the old device.
  //
  // This DB lookup is intentionally in its own try/catch, separate from the
  // JWT check above: a thrown error here (e.g. a connection pool timeout)
  // means the token's validity is unknown, not that it's invalid — treating
  // it as UNAUTHORIZED would force-logout a user whose session is actually
  // still fine, so it gets a distinct 5xx instead.
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { sessionVersion: true, deletedAt: true },
    });
  } catch (err) {
    console.error("authMiddleware DB lookup error:", err.message);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR");
  }

  if (!user || user.deletedAt) {
    return errorResponse(res, "Missing or invalid auth token", 401, "UNAUTHORIZED");
  }

  if (decoded.sessionVersion !== user.sessionVersion) {
    return errorResponse(
      res,
      "Your session has been ended because you logged in on another device.",
      401,
      "SESSION_DISPLACED",
    );
  }
  // ──────────────────────────────────────────────────────────────────────

  req.user = decoded;
  next();
};
