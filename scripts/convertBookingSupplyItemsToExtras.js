/**
 * One-time conversion: "All events" supply amounts (BookingSupplyItem) used to
 * store the item's whole-booking total, and the app showed
 * max(total, events' sum). They are now extras added on top of every event's
 * own amount. This rewrites each older row (isExtra = false) to
 * max(0, total - events' sum) and marks it isExtra = true, so every booking
 * shows exactly the same quantities as before; rows that end up at 0 (the
 * events already needed as much or more) are deleted.
 *
 * Safe to re-run: converted rows are isExtra = true and are skipped. Until it
 * runs, the API already reads older rows the same way (bookingLevelExtraQty
 * in src/utils/bookingSupplyExtras.js),
 * so it can run any time after the 20261102120000 migration.
 *
 * Events' sums use each booking's current guest counts and recipes, computed
 * as the business owner (menu visibility can depend on the user).
 *
 * Usage:
 *   node scripts/convertBookingSupplyItemsToExtras.js           # dry run, prints changes
 *   node scripts/convertBookingSupplyItemsToExtras.js --apply   # writes them
 */
const prisma = require("../src/config/prisma");
const { buildFullBookingSupplyBreakdown } = require("../src/controllers/supplyController");
const {
  eventsTotalByIdFromTotals,
  planBookingSupplyConversion,
} = require("../src/utils/bookingSupplyExtras");

const APPLY = process.argv.includes("--apply");

async function main() {
  const legacy = await prisma.bookingSupplyItem.findMany({
    where: { isExtra: false },
    orderBy: { createdAt: "asc" },
    include: {
      booking: {
        select: { id: true, businessId: true, business: { select: { createdByUserId: true } } },
      },
    },
  });
  const byBooking = new Map();
  for (const row of legacy) {
    if (!byBooking.has(row.bookingId)) byBooking.set(row.bookingId, []);
    byBooking.get(row.bookingId).push(row);
  }
  console.log(
    `${APPLY ? "Applying" : "Dry run"}: ${legacy.length} row(s) to convert in ${byBooking.size} booking(s).`,
  );

  let updated = 0;
  let deleted = 0;
  let unchanged = 0;
  let failed = 0;
  for (const [bookingId, rows] of byBooking) {
    try {
      const booking = rows[0].booking;
      const breakdown = await buildFullBookingSupplyBreakdown({
        bookingId,
        businessId: booking.businessId,
        userId: booking.business?.createdByUserId ?? null,
        language: "en",
      });
      const eventsTotalById = eventsTotalByIdFromTotals(breakdown.totals);
      const ops = [];
      for (const { row, action, quantity } of planBookingSupplyConversion(rows, eventsTotalById)) {
        const events = eventsTotalById.get(row.supplyItemId);
        const label = `${bookingId} ${row.supplyItemId}: ${row.quantity} ${row.unit}` +
          (events ? ` (events ${events.quantity} ${events.unit})` : " (no event uses it)");
        if (action === "delete") {
          console.log(`  delete  ${label}`);
          ops.push(prisma.bookingSupplyItem.delete({ where: { id: row.id } }));
          deleted += 1;
        } else {
          if (quantity === Number(row.quantity)) unchanged += 1;
          else console.log(`  update  ${label} -> extra ${quantity} ${row.unit}`);
          ops.push(
            prisma.bookingSupplyItem.update({
              where: { id: row.id },
              data: { quantity, isExtra: true },
            }),
          );
          updated += 1;
        }
      }
      // One booking at a time, all-or-nothing (array form: no interactive transaction).
      if (APPLY) await prisma.$transaction(ops);
    } catch (e) {
      failed += 1;
      console.error(`  FAILED ${bookingId}:`, e.message);
    }
  }

  console.log(
    `${APPLY ? "Done" : "Would do"}: ${updated} updated (${unchanged} keep their quantity, only marked as extra), ` +
      `${deleted} deleted, ${failed} booking(s) failed.`,
  );
  if (!APPLY) console.log("Nothing written. Re-run with --apply to save.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
