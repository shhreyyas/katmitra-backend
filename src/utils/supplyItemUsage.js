const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");

/** JSON columns whose entries carry a `supply_item_id`. */
const JSON_INGREDIENT_COLUMNS = [
  { key: "menu_items", table: "MenuItem", column: "ingredients" },
  { key: "dishes", table: "Dish", column: "requiredIngredients" },
  { key: "dishes", table: "DishMenuItem", column: "ingredients" },
];

const emptyUsage = () => ({
  bookings: 0,
  booking_events: 0,
  saved_lists: 0,
  menu_items: 0,
  dishes: 0,
  total: 0,
});

/**
 * Where each supply item is referenced: booking supply lists, per-event
 * lists, saved lists, and the ingredient JSON on menu items and dishes.
 * Returns a Map of supply item id → counts (every requested id is present).
 */
async function getSupplyItemUsage(ids) {
  const usage = new Map(ids.map((id) => [id, emptyUsage()]));
  if (!ids.length) return usage;

  const where = { supplyItemId: { in: ids } };
  const [bookings, events, saved] = await Promise.all([
    prisma.bookingSupplyItem.groupBy({ by: ["supplyItemId"], where, _count: { _all: true } }),
    prisma.bookingEventSupplyItem.groupBy({ by: ["supplyItemId"], where, _count: { _all: true } }),
    prisma.supplySavedListItem.groupBy({ by: ["supplyItemId"], where, _count: { _all: true } }),
  ]);
  bookings.forEach((r) => (usage.get(r.supplyItemId).bookings = r._count._all));
  events.forEach((r) => (usage.get(r.supplyItemId).booking_events = r._count._all));
  saved.forEach((r) => (usage.get(r.supplyItemId).saved_lists = r._count._all));

  // Ids are UUIDs, so a text match on the serialized JSON cannot hit anything else.
  const patterns = ids.map((id) => `%${id}%`);
  for (const { key, table, column } of JSON_INGREDIENT_COLUMNS) {
    const rows = await prisma.$queryRaw(
      Prisma.sql`SELECT ${Prisma.raw(`"${column}"`)}::text AS body FROM ${Prisma.raw(`"${table}"`)}
                 WHERE ${Prisma.raw(`"${column}"`)}::text LIKE ANY (${patterns}::text[])`,
    );
    for (const { body } of rows) {
      for (const id of ids) {
        if (body.includes(id)) usage.get(id)[key] += 1;
      }
    }
  }

  usage.forEach((u) => {
    u.total = u.bookings + u.booking_events + u.saved_lists + u.menu_items + u.dishes;
  });
  return usage;
}

module.exports = { getSupplyItemUsage };
