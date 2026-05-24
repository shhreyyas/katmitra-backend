const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");

const SETTINGS_ID = "default";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatSettings(row) {
  return {
    app_name: row.appName,
    support_email: row.supportEmail,
    payment_upi: row.paymentUpi,
    payment_bank: row.paymentBank,
    updated_at: row.updatedAt.toISOString(),
  };
}

async function ensureSettings() {
  let row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) {
    row = await prisma.appSettings.create({ data: { id: SETTINGS_ID } });
  }
  return row;
}

/** GET /api/admin/v1/settings */
exports.getSettings = async (req, res) => {
  try {
    const row = await ensureSettings();
    return successResponse(res, "Settings", { settings: formatSettings(row) });
  } catch (error) {
    console.error("getSettings admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PUT /api/admin/v1/settings */
exports.updateSettings = async (req, res) => {
  try {
    const body = req.body ?? {};
    const data = {};

    if (body.app_name !== undefined || body.appName !== undefined) {
      const appName = String(body.app_name ?? body.appName ?? "").trim();
      if (appName.length < 2) {
        return errorResponse(res, "App name must be at least 2 characters", 422, "VALIDATION_ERROR");
      }
      data.appName = appName;
    }

    if (body.support_email !== undefined || body.supportEmail !== undefined) {
      const supportEmail = String(body.support_email ?? body.supportEmail ?? "").trim();
      if (supportEmail && !EMAIL_RE.test(supportEmail)) {
        return errorResponse(res, "Invalid support email", 422, "VALIDATION_ERROR");
      }
      data.supportEmail = supportEmail || "support@katmitra.com";
    }

    if (body.payment_upi !== undefined || body.paymentUpi !== undefined) {
      data.paymentUpi = String(body.payment_upi ?? body.paymentUpi ?? "").trim();
    }

    if (body.payment_bank !== undefined || body.paymentBank !== undefined) {
      data.paymentBank = String(body.payment_bank ?? body.paymentBank ?? "").trim();
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(res, "No settings fields to update", 422, "VALIDATION_ERROR");
    }

    await ensureSettings();
    const row = await prisma.appSettings.update({
      where: { id: SETTINGS_ID },
      data,
    });

    return successResponse(res, "Settings updated", { settings: formatSettings(row) });
  } catch (error) {
    console.error("updateSettings admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
