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
    default_service_charge_pct: Number(row.defaultServiceChargePct ?? 10),
    default_tax_pct: Number(row.defaultTaxPct ?? 5),
    android_app_url: row.androidAppUrl ?? "",
    ios_app_url: row.iosAppUrl ?? "",
    updated_at: row.updatedAt.toISOString(),
  };
}

/**
 * The marketing site redirects visitors to these links, so only genuine store
 * listing URLs are accepted — never an arbitrary address.
 */
const STORE_HOSTS = {
  android: ["play.google.com"],
  ios: ["apps.apple.com", "itunes.apple.com"],
};

/** Returns the cleaned URL, "" when blank, or null when it is not a valid store link. */
function parseStoreUrl(raw, platform) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !STORE_HOSTS[platform].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function ensureSettings() {
  let row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) {
    row = await prisma.appSettings.create({ data: { id: SETTINGS_ID } });
  }
  return row;
}
exports.ensureSettings = ensureSettings;

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

    if (body.default_service_charge_pct !== undefined) {
      const sc = Number(body.default_service_charge_pct);
      if (!Number.isFinite(sc) || sc < 0 || sc > 100) {
        return errorResponse(
          res,
          "Service charge % must be between 0 and 100",
          422,
          "VALIDATION_ERROR",
        );
      }
      data.defaultServiceChargePct = sc;
    }

    if (body.default_tax_pct !== undefined) {
      const txp = Number(body.default_tax_pct);
      if (!Number.isFinite(txp) || txp < 0 || txp > 100) {
        return errorResponse(
          res,
          "Tax % must be between 0 and 100",
          422,
          "VALIDATION_ERROR",
        );
      }
      data.defaultTaxPct = txp;
    }

    if (body.android_app_url !== undefined) {
      const url = parseStoreUrl(body.android_app_url, "android");
      if (url === null) {
        return errorResponse(
          res,
          "Android link must be a Google Play address (https://play.google.com/...)",
          422,
          "VALIDATION_ERROR",
        );
      }
      data.androidAppUrl = url;
    }

    if (body.ios_app_url !== undefined) {
      const url = parseStoreUrl(body.ios_app_url, "ios");
      if (url === null) {
        return errorResponse(
          res,
          "iOS link must be an App Store address (https://apps.apple.com/...)",
          422,
          "VALIDATION_ERROR",
        );
      }
      data.iosAppUrl = url;
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

/** GET /api/v1/app-links — public; the marketing site's download badges, QR code and /download redirect. */
exports.getPublicAppLinks = async (req, res) => {
  try {
    const row = await ensureSettings();
    res.set("Cache-Control", "public, max-age=300");
    return successResponse(res, "App links", {
      android_url: row.androidAppUrl || null,
      ios_url: row.iosAppUrl || null,
    });
  } catch (error) {
    console.error("getPublicAppLinks:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
