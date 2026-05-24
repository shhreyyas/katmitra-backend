const prisma = require("../config/prisma");

const PLATFORMS = ["ios", "android"];
const DEFAULT_MESSAGE =
  "A new version of the app is available. Please update to the latest version for the best experience.";

function envDefaults(platform) {
  const isIos = platform === "ios";
  return {
    latestVersion: isIos
      ? process.env.APP_IOS_LATEST_VERSION || process.env.APP_LATEST_VERSION || "1.0.0"
      : process.env.APP_ANDROID_LATEST_VERSION || process.env.APP_LATEST_VERSION || "1.0.0",
    minimumVersion: isIos
      ? process.env.APP_IOS_MINIMUM_VERSION || process.env.APP_MINIMUM_VERSION || "1.0.0"
      : process.env.APP_ANDROID_MINIMUM_VERSION || process.env.APP_MINIMUM_VERSION || "1.0.0",
    updateMessage: process.env.APP_UPDATE_MESSAGE || DEFAULT_MESSAGE,
  };
}

function formatConfigRow(row) {
  return {
    platform: row.platform,
    latest_version: row.latestVersion,
    minimum_version: row.minimumVersion,
    update_message: row.updateMessage,
    updated_at: row.updatedAt.toISOString(),
  };
}

async function ensurePlatformConfig(platform) {
  let row = await prisma.appVersionConfig.findUnique({ where: { platform } });
  if (row) return row;

  const defaults = envDefaults(platform);
  row = await prisma.appVersionConfig.create({
    data: {
      platform,
      latestVersion: defaults.latestVersion,
      minimumVersion: defaults.minimumVersion,
      updateMessage: defaults.updateMessage,
    },
  });
  return row;
}

/** Resolve config for public version check (DB first, then env). */
async function resolveVersionConfig(platform) {
  const row = await prisma.appVersionConfig.findUnique({ where: { platform } });
  if (row) {
    return {
      latestVersion: row.latestVersion,
      minimumVersion: row.minimumVersion,
      updateMessage: row.updateMessage,
    };
  }
  return envDefaults(platform);
}

module.exports = {
  PLATFORMS,
  DEFAULT_MESSAGE,
  envDefaults,
  formatConfigRow,
  ensurePlatformConfig,
  resolveVersionConfig,
};
