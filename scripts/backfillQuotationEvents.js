/**
 * One-time backfill: give every pre-existing Quotation (flat eventDate/guestCount/menuItems,
 * no QuotationEvent rows) exactly one QuotationEvent built from those legacy fields, so the
 * app's new multi-event UI can read every quotation through the same `events[]` shape.
 *
 * Safe to re-run: only quotations with zero QuotationEvent rows are touched.
 *
 * Usage: node scripts/backfillQuotationEvents.js
 */
const prisma = require("../src/config/prisma");

function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const quotations = await prisma.quotation.findMany({
    where: { events: { none: {} } },
    include: { menuItems: true },
  });

  console.log(`Found ${quotations.length} quotation(s) without events to backfill.`);

  let created = 0;
  for (const q of quotations) {
    const menuIds = q.menuItems.map((mi) => mi.menuItemId);
    const menuRows = menuIds.length
      ? await prisma.menuItem.findMany({
          where: { id: { in: menuIds } },
          select: { id: true, imageUrl: true, categorySlug: true },
        })
      : [];
    const byId = new Map(menuRows.map((m) => [m.id, m]));

    const menu_items = q.menuItems.map((mi) => ({
      id: mi.menuItemId,
      name: mi.nameSnapshot || "Menu item",
      category: byId.get(mi.menuItemId)?.categorySlug || "",
      quantity_per_plate: 1,
      image_url: byId.get(mi.menuItemId)?.imageUrl ?? null,
    }));

    const price_per_plate =
      q.platePrice != null
        ? num(q.platePrice)
        : q.menuItems.reduce((s, mi) => s + num(mi.pricePerPlateSnapshot), 0);

    await prisma.quotationEvent.create({
      data: {
        quotationId: q.id,
        eventAt: q.eventDate,
        eventLocation: null,
        functionType: q.functionType,
        jamanvarType: null,
        guestCount: q.guestCount,
        status: "PENDING",
        eventSnapshot: {
          dish_name: q.functionType || "Menu",
          price_per_plate,
          menu_items,
          event_snapshot_version: 1,
        },
      },
    });
    created += 1;
  }

  console.log(`Created ${created} QuotationEvent row(s).`);
}

main()
  .catch((e) => {
    console.error("backfillQuotationEvents failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
