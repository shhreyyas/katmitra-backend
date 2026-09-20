/**
 * One-time backfill: rewrite SupplySavedList.title from the old
 * auto-generated "<customer> - <categories> - <date>" format to the current
 * "<customer> - <date>" format (see buildSavedListTitle in
 * supplySavedListController.js).
 *
 * Only touches rows auto-saved from confirmBooking (bookingId set,
 * bookingEventId null — see autoSaveSupplyListsForConfirmedBooking) whose
 * title still matches the exact old computed value. Manually-created lists
 * (user-typed title via createSupplySavedList/updateSupplySavedList) are
 * left untouched, since we can't tell a user-chosen title from a
 * coincidentally-matching one otherwise.
 *
 * Usage: node scripts/backfillSupplySavedListTitles.js
 */
const prisma = require("../src/config/prisma");

function formatTitleDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(dt);
}

async function main() {
  const rows = await prisma.supplySavedList.findMany({
    where: { bookingId: { not: null }, bookingEventId: null },
    select: {
      id: true,
      title: true,
      categoriesLabel: true,
      createdAt: true,
      booking: { select: { customerName: true } },
    },
  });

  console.log(`Found ${rows.length} auto-saved booking-level list(s).`);

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const dateStr = formatTitleDate(row.createdAt);
    const customerName = row.booking?.customerName
      ? String(row.booking.customerName).trim()
      : "";
    const cats = row.categoriesLabel ?? "";
    const oldExpectedTitle = customerName
      ? `${customerName} - ${cats} - ${dateStr}`
      : `${cats} - ${dateStr}`;

    if (row.title !== oldExpectedTitle) {
      skipped += 1;
      continue;
    }

    const newTitle = customerName ? `${customerName} - ${dateStr}` : dateStr;
    await prisma.supplySavedList.update({
      where: { id: row.id },
      data: { title: newTitle },
    });
    console.log(`  ${row.id}: "${row.title}" -> "${newTitle}"`);
    updated += 1;
  }

  console.log(`Updated ${updated} title(s), skipped ${skipped} (didn't match the old auto-generated pattern).`);
}

main()
  .catch((e) => {
    console.error("backfillSupplySavedListTitles failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
