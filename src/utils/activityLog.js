const prisma = require("../config/prisma");

/**
 * Fire-and-forget admin activity log (does not throw to callers).
 */
function logActivity({ type, message, actorUserId = null, meta = null }) {
  prisma.activityLog
    .create({
      data: {
        type,
        message: String(message).slice(0, 2000),
        actorUserId,
        meta: meta ?? undefined,
      },
    })
    .catch((err) => {
      console.error("logActivity:", err.message);
    });
}

module.exports = { logActivity };
