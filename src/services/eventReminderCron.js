/**
 * Event Reminder Cron
 *
 * Fires every 15 minutes — cron expression: "* /15 * * * *" (no space).
 * Delegates to reminderService which handles the windowed query, push delivery,
 * and EventReminder dedup record insertion.
 *
 * MVP: only 24_HOUR is active.
 * Phase 2: un-comment 2_HOUR and 30_MINUTE when ready.
 *
 * Single-instance re-entry protection:
 *   `_isRunning` prevents a second cron tick from starting while the previous
 *   run is still in progress (e.g. slow DB or many events).
 *
 * Multi-instance (horizontal scale):
 *   Replace the `_isRunning` flag with a distributed lock — e.g. Redis SETNX
 *   with a 14-minute TTL keyed on `katmitra:reminder:lock:{reminderType}`.
 */

const cron = require("node-cron");
const { processReminderType } = require("./reminderService");
const { processBusinessSetupReminder } = require("./onboardingReminderService");
const { processBookingNoEventsReminder } = require("./bookingEventReminderService");
const { processEventNoMenuReminder } = require("./eventMenuReminderService");
const { processPaymentPendingReminder } = require("./paymentPendingReminderService");
const { processQuotationExpiringReminder, processQuotationExpiredReminder } = require("./quotationReminderService");
const { processDraftBookingExpiringReminder, processDraftBookingExpiredReminder } = require("./draftBookingReminderService");

const ACTIVE_REMINDER_TYPES = [
  "24_HOUR",
  // "2_HOUR",     // Phase 2
  // "30_MINUTE",  // Phase 2
];

let _isRunning = false;

async function runReminders() {
  if (_isRunning) {
    console.warn("[EventReminder] Previous run still in progress — skipping this tick.");
    return;
  }

  _isRunning = true;
  const start = Date.now();
  console.log("[EventReminder] Cron triggered at", new Date().toISOString());

  try {
    for (const type of ACTIVE_REMINDER_TYPES) {
      const stats = await processReminderType(type);
      if (stats.processed > 0) {
        console.log(
          `[EventReminder:${type}] processed=${stats.processed} ` +
          `notified=${stats.notified} failed=${stats.failed} skipped=${stats.skipped}`,
        );
      }
    }
    const onboardingStats = await processBusinessSetupReminder();
    if (onboardingStats.notified > 0 || onboardingStats.failed > 0) {
      console.log(
        `[OnboardingReminder] notified=${onboardingStats.notified} ` +
        `failed=${onboardingStats.failed} skipped=${onboardingStats.skipped}`,
      );
    }

    const bookingStats = await processBookingNoEventsReminder();
    if (bookingStats.notified > 0 || bookingStats.failed > 0) {
      console.log(
        `[BookingNoEvents] notified=${bookingStats.notified} ` +
        `failed=${bookingStats.failed} skipped=${bookingStats.skipped}`,
      );
    }

    const menuStats = await processEventNoMenuReminder();
    if (menuStats.notified > 0 || menuStats.failed > 0) {
      console.log(
        `[EventNoMenu] notified=${menuStats.notified} ` +
        `failed=${menuStats.failed} skipped=${menuStats.skipped}`,
      );
    }

    const paymentStats = await processPaymentPendingReminder();
    if (paymentStats.notified > 0 || paymentStats.failed > 0) {
      console.log(
        `[PaymentPending] notified=${paymentStats.notified} ` +
        `failed=${paymentStats.failed} skipped=${paymentStats.skipped}`,
      );
    }

    const qExpiring = await processQuotationExpiringReminder();
    if (qExpiring.notified > 0 || qExpiring.failed > 0) {
      console.log(`[QuotationReminder:expiring_3d] notified=${qExpiring.notified} failed=${qExpiring.failed} skipped=${qExpiring.skipped}`);
    }

    const qExpired = await processQuotationExpiredReminder();
    if (qExpired.notified > 0 || qExpired.failed > 0) {
      console.log(`[QuotationReminder:expired_1d] notified=${qExpired.notified} failed=${qExpired.failed} skipped=${qExpired.skipped}`);
    }

    const dExpiring = await processDraftBookingExpiringReminder();
    if (dExpiring.notified > 0 || dExpiring.failed > 0) {
      console.log(`[DraftReminder:draft_expiring_3d] notified=${dExpiring.notified} failed=${dExpiring.failed} skipped=${dExpiring.skipped}`);
    }

    const dExpired = await processDraftBookingExpiredReminder();
    if (dExpired.notified > 0 || dExpired.failed > 0) {
      console.log(`[DraftReminder:draft_expired_1d] notified=${dExpired.notified} failed=${dExpired.failed} skipped=${dExpired.skipped}`);
    }
  } catch (err) {
    console.error("[EventReminder] Unexpected error in cron run:", err.message);
  } finally {
    _isRunning = false;
    console.log(`[EventReminder] Run completed in ${Date.now() - start}ms`);
  }
}

function startEventReminderCron() {
  cron.schedule("*/15 * * * *", () => { void runReminders(); });
  console.log("[EventReminder] 15-minute reminder cron started.");
}

module.exports = { startEventReminderCron, runReminders };
