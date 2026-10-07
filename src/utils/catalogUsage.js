const prisma = require("../config/prisma");

/** Counts rows of `model` grouped by `field` for the given ids → Map(id → count). */
async function countBy(model, field, ids) {
  const rows = await model.groupBy({
    by: [field],
    where: { [field]: { in: ids } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r[field], r._count._all]));
}

/** Where each menu item is referenced. Map(id → { bookings, quotations, dishes, total }). */
async function getMenuItemUsage(ids) {
  const usage = new Map(ids.map((id) => [id, { bookings: 0, quotations: 0, dishes: 0, total: 0 }]));
  if (!ids.length) return usage;
  const [bookings, quotations, dishes] = await Promise.all([
    countBy(prisma.bookingMenuItem, "menuItemId", ids),
    countBy(prisma.quotationMenuItem, "menuItemId", ids),
    countBy(prisma.dishMenuItem, "menuItemId", ids),
  ]);
  usage.forEach((u, id) => {
    u.bookings = bookings.get(id) ?? 0;
    u.quotations = quotations.get(id) ?? 0;
    u.dishes = dishes.get(id) ?? 0;
    u.total = u.bookings + u.quotations + u.dishes;
  });
  return usage;
}

/** Where each extra service is referenced. Map(id → { bookings, quotations, total }). */
async function getExtraServiceUsage(ids) {
  const usage = new Map(ids.map((id) => [id, { bookings: 0, quotations: 0, total: 0 }]));
  if (!ids.length) return usage;
  const [bookings, quotations] = await Promise.all([
    countBy(prisma.bookingExtraServiceLine, "extraServiceId", ids),
    countBy(prisma.quotationExtraServiceLine, "extraServiceId", ids),
  ]);
  usage.forEach((u, id) => {
    u.bookings = bookings.get(id) ?? 0;
    u.quotations = quotations.get(id) ?? 0;
    u.total = u.bookings + u.quotations;
  });
  return usage;
}

/** "3 bookings, 1 quotation" — only the non-zero parts. */
function describeUsage(usage, labels) {
  return Object.entries(labels)
    .filter(([key]) => usage[key])
    .map(([key, [one, many]]) => `${usage[key]} ${usage[key] === 1 ? one : many}`)
    .join(", ");
}

module.exports = { getMenuItemUsage, getExtraServiceUsage, describeUsage };
