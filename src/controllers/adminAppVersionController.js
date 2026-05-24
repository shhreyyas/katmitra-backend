const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { compareVersions } = require("../utils/compareVersions");
const {
  PLATFORMS,
  DEFAULT_MESSAGE,
  formatConfigRow,
  ensurePlatformConfig,
} = require("../utils/appVersionConfig");

const VERSION_RE = /^\d+\.\d+\.\d+$/;

function parseVersionField(value, label) {
  const v = String(value ?? "").trim();
  if (!VERSION_RE.test(v)) {
    return { error: `${label} must be in x.y.z format (e.g. 1.2.0)` };
  }
  return { value: v };
}

function parsePlatformPayload(body, platform) {
  const block = body?.[platform];
  if (!block || typeof block !== "object") {
    return { skip: true };
  }

  const latest = parseVersionField(
    block.latest_version ?? block.latestVersion,
    `${platform} latest version`,
  );
  if (latest.error) return { error: latest.error };

  const minimum = parseVersionField(
    block.minimum_version ?? block.minimumVersion,
    `${platform} minimum version`,
  );
  if (minimum.error) return { error: minimum.error };

  if (compareVersions(minimum.value, latest.value) > 0) {
    return {
      error: `${platform} minimum version cannot be greater than latest version`,
    };
  }

  const updateMessage = String(
    block.update_message ?? block.updateMessage ?? DEFAULT_MESSAGE,
  ).trim();
  if (!updateMessage) {
    return { error: `${platform} update message is required` };
  }

  return {
    skip: false,
    data: {
      latestVersion: latest.value,
      minimumVersion: minimum.value,
      updateMessage,
    },
  };
}

/** GET /api/admin/v1/app-version */
exports.getAppVersionConfig = async (req, res) => {
  try {
    const rows = await Promise.all(PLATFORMS.map((p) => ensurePlatformConfig(p)));
    const byPlatform = Object.fromEntries(
      rows.map((r) => [r.platform, formatConfigRow(r)]),
    );
    return successResponse(res, "App version config", byPlatform);
  } catch (error) {
    console.error("getAppVersionConfig admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/** PUT /api/admin/v1/app-version */
exports.updateAppVersionConfig = async (req, res) => {
  try {
    const body = req.body ?? {};
    const updates = [];

    for (const platform of PLATFORMS) {
      const parsed = parsePlatformPayload(body, platform);
      if (parsed.error) {
        return errorResponse(res, parsed.error, 422, "VALIDATION_ERROR");
      }
      if (parsed.skip) continue;

      await ensurePlatformConfig(platform);
      updates.push(
        prisma.appVersionConfig.update({
          where: { platform },
          data: parsed.data,
        }),
      );
    }

    if (updates.length === 0) {
      return errorResponse(
        res,
        "Provide ios and/or android config in the request body",
        422,
        "VALIDATION_ERROR",
      );
    }

    await prisma.$transaction(updates);
    const rows = await Promise.all(PLATFORMS.map((p) => ensurePlatformConfig(p)));
    const byPlatform = Object.fromEntries(
      rows.map((r) => [r.platform, formatConfigRow(r)]),
    );

    return successResponse(res, "App version config updated", byPlatform);
  } catch (error) {
    console.error("updateAppVersionConfig admin:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
