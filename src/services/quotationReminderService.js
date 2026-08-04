/**
 * Quotation Reminder Service
 *
 * Two reminders for quotations that are DRAFT or SENT and have an eventDate set:
 *   1. expiring_3d  — fires 3 days before eventDate
 *   2. expired_1d   — fires 1 day after eventDate has passed
 *
 * Dedup: QuotationReminder model, @@unique([quotationId, reminderType]).
 * Retry: failed push → no dedup record inserted → retried next 15-min tick.
 */

const prisma = require("../config/prisma");
const { sendGroupedNotification } = require("../utils/notificationLocalization");
const { getNotificationContent } = require("../utils/notificationTranslations");

const WINDOW_MINUTES   = 15;
const DAYS_BEFORE      = 3;
const DAYS_AFTER       = 1;

const ELIGIBLE_STATUSES = ["DRAFT", "SENT"];

const USER_FILTER = {
  notificationStatus: 1,
  deviceToken:        { not: null },
  deletedAt:          null,
};

function _buildWindow(offsetMs) {
  const now         = new Date();
  const windowEnd   = new Date(now.getTime() + offsetMs);
  const windowStart = new Date(windowEnd.getTime() - WINDOW_MINUTES * 60_000);
  return { windowStart, windowEnd };
}

async function _fetchQuotations(windowStart, windowEnd, reminderType) {
  return prisma.quotation.findMany({
    where: {
      eventDate:          { gte: windowStart, lt: windowEnd },
      status:             { in: ELIGIBLE_STATUSES },
      quotationReminders: { none: { reminderType } },
      business:           { users: { some: USER_FILTER } },
    },
    select: {
      id:         true,
      clientName: true,
      business: {
        select: {
          users: {
            where:  USER_FILTER,
            select: { id: true, deviceToken: true, language: true },
          },
        },
      },
    },
  });
}

async function _notify(quotation, users, messageId, params, type, reminderType) {
  const notifData = { screen: "summaryQuotations", quotationId: quotation.id };

  let pushResult;
  try {
    pushResult = await sendGroupedNotification(
      users,
      (lang) => getNotificationContent(messageId, lang, params),
      notifData,
      type,
    );
  } catch (err) {
    console.error(`[QuotationReminder:${reminderType}] sendGroupedNotification threw for ${quotation.id}:`, err.message);
    return false;
  }

  const delivered = pushResult.successCount > 0 || pushResult.skippedCount === users.length;
  if (!delivered) {
    console.warn(`[QuotationReminder:${reminderType}] Delivery failed for ${quotation.id} — will retry`);
    return false;
  }

  try {
    await prisma.quotationReminder.upsert({
      where:  { quotationId_reminderType: { quotationId: quotation.id, reminderType } },
      create: { quotationId: quotation.id, reminderType },
      update: {},
    });
  } catch (err) {
    console.error(`[QuotationReminder:${reminderType}] Dedup upsert failed for ${quotation.id}:`, err.message);
  }

  console.log(
    `[QuotationReminder:${reminderType}] Quotation ${quotation.id} — ` +
    `sent=${pushResult.successCount} errors=${pushResult.errorCount}`,
  );
  return true;
}

async function _runReminder(windowStart, windowEnd, reminderType, messageId, notifType) {
  let quotations;
  try {
    quotations = await _fetchQuotations(windowStart, windowEnd, reminderType);
  } catch (err) {
    console.error(`[QuotationReminder:${reminderType}] DB query failed:`, err.message);
    return { processed: 0, notified: 0, failed: 0, skipped: 0 };
  }

  if (quotations.length === 0) return { processed: 0, notified: 0, failed: 0, skipped: 0 };

  console.log(`[QuotationReminder:${reminderType}] ${quotations.length} quotation(s) in window`);

  let notified = 0, failed = 0, skipped = 0;

  for (const q of quotations) {
    const users = q.business.users.filter((u) => u.deviceToken);

    if (users.length === 0) { skipped++; continue; }

    const ok = await _notify(q, users, messageId, { clientName: q.clientName }, notifType, reminderType);
    if (ok) notified++;
    else    failed++;
  }

  return { processed: quotations.length, notified, failed, skipped };
}

/**
 * Fires 3 days before eventDate for DRAFT/SENT quotations.
 */
async function processQuotationExpiringReminder() {
  const { windowStart, windowEnd } = _buildWindow(DAYS_BEFORE * 24 * 60 * 60_000);
  return _runReminder(windowStart, windowEnd, "expiring_3d", "quotationUpcoming", "quotation_expiring");
}

/**
 * Fires 1 day after eventDate has passed for DRAFT/SENT quotations.
 */
async function processQuotationExpiredReminder() {
  const { windowStart, windowEnd } = _buildWindow(-DAYS_AFTER * 24 * 60 * 60_000);
  return _runReminder(windowStart, windowEnd, "expired_1d", "quotationPassed", "quotation_expired");
}

module.exports = { processQuotationExpiringReminder, processQuotationExpiredReminder };
