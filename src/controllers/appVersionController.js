const { successResponse, errorResponse } = require("../utils/response");
const { compareVersions } = require("../utils/compareVersions");
const { resolveVersionConfig } = require("../utils/appVersionConfig");

/**
 * GET /api/v1/app-latest-version?platform=ios|android&app_version=1.0.0
 * Public — no auth required.
 * Config is stored in AppVersionConfig (admin UI); env vars are fallback when no row exists.
 */
exports.getLatestVersion = async (req, res) => {
  try {
    const platform = String(req.query.platform ?? "").toLowerCase();
    const appVersion = req.query.app_version;

    if (!platform || !appVersion) {
      return errorResponse(
        res,
        "platform and app_version query params are required",
        422,
        "VALIDATION_ERROR",
      );
    }
    if (platform !== "ios" && platform !== "android") {
      return errorResponse(res, "platform must be ios or android", 422, "VALIDATION_ERROR");
    }

    const { latestVersion, minimumVersion, updateMessage } =
      await resolveVersionConfig(platform);

    const forceUpdate = compareVersions(appVersion, minimumVersion) < 0;
    const optionalUpdate =
      !forceUpdate && compareVersions(appVersion, latestVersion) < 0;

    return successResponse(res, "Version info", {
      latest_version: latestVersion,
      minimum_version: minimumVersion,
      force_update: forceUpdate,
      optional_update: optionalUpdate,
      version_update_message: updateMessage,
    });
  } catch (error) {
    console.error("getLatestVersion:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
