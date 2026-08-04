/**
 * Groups a batch of notification recipients by their preferred language and
 * sends one push batch + one UserNotification createMany per language group,
 * instead of a single shared English message for every recipient.
 */

const prisma = require("../config/prisma");
const { sendPushNotifications } = require("./expoPush");
const { normalizeLanguageCode } = require("./localization");

/**
 * @param {Array<{id: string, deviceToken: string, language?: string}>} recipients
 * @param {(lang: string) => {title: string, body: string}} buildContent
 * @param {object} notifData - shared `data` payload (deep-link info) for every recipient
 * @param {string} type - UserNotification.type
 * @returns {Promise<{successCount: number, errorCount: number, skippedCount: number, notifiedUserIds: string[]}>}
 */
async function sendGroupedNotification(recipients, buildContent, notifData, type) {
  const eligible = recipients.filter((r) => r.deviceToken);

  const groups = new Map();
  for (const recipient of eligible) {
    const lang = normalizeLanguageCode(recipient.language);
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang).push(recipient);
  }

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = recipients.length - eligible.length;
  const notifiedUserIds = [];

  await Promise.all(
    Array.from(groups.entries()).map(async ([lang, users]) => {
      const { title, body } = buildContent(lang);
      const tokens = users.map((u) => u.deviceToken);

      try {
        await prisma.userNotification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            title,
            body,
            type,
            data: notifData,
          })),
        });
      } catch (err) {
        console.error(`[NotificationLocalization] Inbox createMany failed (lang=${lang}):`, err.message);
        errorCount += tokens.length;
        return;
      }

      let pushResult;
      try {
        pushResult = await sendPushNotifications(tokens, { title, body, data: notifData });
      } catch (err) {
        console.error(`[NotificationLocalization] sendPushNotifications threw (lang=${lang}):`, err.message);
        errorCount += tokens.length;
        return;
      }

      successCount += pushResult.successCount;
      errorCount += pushResult.errorCount;
      skippedCount += pushResult.skippedCount;
      if (pushResult.successCount > 0 || pushResult.skippedCount === tokens.length) {
        notifiedUserIds.push(...users.map((u) => u.id));
      }
    }),
  );

  return { successCount, errorCount, skippedCount, notifiedUserIds };
}

module.exports = { sendGroupedNotification };
