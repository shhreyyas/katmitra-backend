/**
 * Onboarding Reminder Service
 *
 * Finds users who signed up 24 hours ago but still have no business registered
 * and sends them a push notification + inbox record to complete their setup.
 *
 * Dedup strategy:
 *   OnboardingReminder has @@unique([userId, reminderType]).
 *   The query filters out users that already have a record (none: {}).
 *   After successful delivery we upsert the record — concurrent cron ticks are safe.
 *
 * Retry strategy:
 *   If push delivery fails we do NOT insert the OnboardingReminder record.
 *   The next cron tick re-queries the same user (no record yet) and retries
 *   within the same 15-minute window.
 */

const prisma = require("../config/prisma");
const { sendPushNotifications } = require("../utils/expoPush");

const REMINDER_TYPE = "business_setup";
const WINDOW_MINUTES = 15;
const HOURS_AHEAD = 24;

const NOTIFICATION_TITLE = "Complete your setup 🏪";
const NOTIFICATION_BODY =
  "You haven't registered your catering business yet. Set it up now to start managing bookings.";

/**
 * Processes the 24-hour business-setup reminder for the current cron tick.
 *
 * @returns {Promise<{ processed: number, notified: number, failed: number, skipped: number }>}
 */
async function processBusinessSetupReminder() {
  const now = new Date();
  // Look back 24 hours; window covers users who signed up in the last 15-minute slot
  const windowEnd = new Date(now.getTime() - HOURS_AHEAD * 60 * 60_000);
  const windowStart = new Date(windowEnd.getTime() - WINDOW_MINUTES * 60_000);

  let users;
  try {
    users = await prisma.user.findMany({
      where: {
        createdAt: { gte: windowStart, lt: windowEnd },
        businessId: null,
        isVerified: true,
        deletedAt: null,
        role: { not: "admin" },
        notificationStatus: 1,
        deviceToken: { not: null },
        onboardingReminders: { none: { reminderType: REMINDER_TYPE } },
      },
      select: { id: true, deviceToken: true },
    });
  } catch (err) {
    console.error("[OnboardingReminder] DB query failed:", err.message);
    return { processed: 0, notified: 0, failed: 0, skipped: 0 };
  }

  if (users.length === 0) {
    return { processed: 0, notified: 0, failed: 0, skipped: 0 };
  }

  console.log(
    `[OnboardingReminder] ${users.length} user(s) in window ` +
    `[${windowStart.toISOString()} – ${windowEnd.toISOString()}]`,
  );

  let notified = 0, failed = 0, skipped = 0;

  for (const user of users) {
    if (!user.deviceToken) { skipped++; continue; }
    const ok = await _sendBusinessSetupReminder(user);
    if (ok) notified++;
    else    failed++;
  }

  return { processed: users.length, notified, failed, skipped };
}

/**
 * Handles the full notification lifecycle for a single user:
 *   1. Persist UserNotification inbox record
 *   2. Send push via Expo
 *   3. On success: upsert OnboardingReminder dedup guard
 *
 * @returns {Promise<boolean>}
 */
async function _sendBusinessSetupReminder(user) {
  const notifData = { screen: "onboarding" };

  // Step 1: persist inbox record before push so it exists when the user taps the banner.
  try {
    await prisma.userNotification.create({
      data: {
        userId: user.id,
        title:  NOTIFICATION_TITLE,
        body:   NOTIFICATION_BODY,
        type:   "business_reminder",
        data:   notifData,
      },
    });
  } catch (err) {
    console.error(`[OnboardingReminder] Inbox create failed for user ${user.id}:`, err.message);
    return false;
  }

  // Step 2: send push
  let pushResult;
  try {
    pushResult = await sendPushNotifications(
      [user.deviceToken],
      { title: NOTIFICATION_TITLE, body: NOTIFICATION_BODY, data: notifData },
    );
  } catch (err) {
    console.error(`[OnboardingReminder] Push failed for user ${user.id}:`, err.message);
    return false;
  }

  const delivered =
    pushResult.successCount > 0 || pushResult.skippedCount === 1;
  if (!delivered) {
    console.warn(
      `[OnboardingReminder] Push delivery failed for user ${user.id} ` +
      `(errors=${pushResult.errorCount}) — will retry next tick`,
    );
    return false;
  }

  // Step 3: upsert dedup guard — concurrent cron overlaps are safe.
  try {
    await prisma.onboardingReminder.upsert({
      where:  { userId_reminderType: { userId: user.id, reminderType: REMINDER_TYPE } },
      create: { userId: user.id, reminderType: REMINDER_TYPE },
      update: {},
    });
  } catch (err) {
    // Non-fatal: push already delivered; log but don't return false.
    console.error(`[OnboardingReminder] Dedup upsert failed for user ${user.id}:`, err.message);
  }

  console.log(
    `[OnboardingReminder] User ${user.id} notified — ` +
    `sent=${pushResult.successCount} errors=${pushResult.errorCount} skipped=${pushResult.skippedCount}`,
  );
  return true;
}

module.exports = { processBusinessSetupReminder };
