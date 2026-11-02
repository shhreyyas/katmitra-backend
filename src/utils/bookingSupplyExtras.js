/**
 * Supply quantity math for "All events" (booking-wide) items, kept free of
 * Prisma/Express so it can be tested on its own (test/bookingSupplyExtras.test.js).
 *
 * Rule: a booking-wide quantity is an extra on top of every event's own
 * amount, so the whole booking needs  events' sum + booking-wide extra.
 * Rows saved before that rule (`isExtra` false) hold the item's whole-booking
 * total, which the app showed as max(total, events' sum); their extra is
 * whatever that total was above the events' sum.
 */

const WEIGHT_UNIT_TO_G = { kg: 1000, g: 1, gram: 1, grams: 1 };
const VOLUME_UNIT_TO_ML = {
  ltr: 1000,
  l: 1000,
  litre: 1000,
  litres: 1000,
  liter: 1000,
  liters: 1000,
  ml: 1,
  millilitre: 1,
  millilitres: 1,
  milliliter: 1,
  milliliters: 1,
};

/**
 * Converts `qty` from `fromUnit` to `toUnit` when both are known weight or
 * volume units (kg/g, ltr/ml and spelling variants). Units that don't match
 * a known family (pcs, or an outright mismatch like weight vs volume) can't
 * be safely combined, so the raw quantity is returned unchanged rather than
 * silently producing a wrong number.
 */
function convertSupplyQty(qty, fromUnit, toUnit) {
  const from = String(fromUnit ?? "").trim().toLowerCase();
  const to = String(toUnit ?? "").trim().toLowerCase();
  if (!from || !to || from === to) return qty;
  if (from in WEIGHT_UNIT_TO_G && to in WEIGHT_UNIT_TO_G) {
    return (qty * WEIGHT_UNIT_TO_G[from]) / WEIGHT_UNIT_TO_G[to];
  }
  if (from in VOLUME_UNIT_TO_ML && to in VOLUME_UNIT_TO_ML) {
    return (qty * VOLUME_UNIT_TO_ML[from]) / VOLUME_UNIT_TO_ML[to];
  }
  return qty;
}

/** True when quantities in these two units can be converted into each other. */
function sameUnitFamily(a, b) {
  const from = String(a ?? "").trim().toLowerCase();
  const to = String(b ?? "").trim().toLowerCase();
  return (
    from === to ||
    (from in WEIGHT_UNIT_TO_G && to in WEIGHT_UNIT_TO_G) ||
    (from in VOLUME_UNIT_TO_ML && to in VOLUME_UNIT_TO_ML)
  );
}

/** supplyItemId -> { quantity, unit } from a breakdown's events totals. */
function eventsTotalByIdFromTotals(totals) {
  const map = new Map();
  for (const row of [...(totals?.ingredients ?? []), ...(totals?.utensils ?? [])]) {
    if (row.supply_item_id) map.set(row.supply_item_id, { quantity: row.total, unit: row.unit });
  }
  return map;
}

/**
 * A booking-wide row's quantity as an extra on top of every event's own
 * amount (in the row's unit, 2 decimals). `eventsTotalById` maps
 * supplyItemId -> { quantity, unit } summed over events. Units that can't be
 * compared (pcs vs kg) keep the stored quantity.
 */
function bookingLevelExtraQty(row, eventsTotalById) {
  const qty = Number(row.quantity) || 0;
  if (row.isExtra) return qty;
  const events = eventsTotalById.get(row.supplyItemId);
  if (!events || !sameUnitFamily(events.unit, row.unit)) return qty;
  const extra = qty - convertSupplyQty(Number(events.quantity) || 0, events.unit, row.unit);
  return extra > 0 ? Math.round(extra * 100) / 100 : 0;
}

/**
 * What the one-time conversion does with each older (isExtra = false) row:
 * "update" to its extra (marking it isExtra), or "delete" when the events
 * already needed as much or more. Rows already isExtra are skipped.
 */
function planBookingSupplyConversion(rows, eventsTotalById) {
  return rows
    .filter((row) => !row.isExtra)
    .map((row) => {
      const extra = bookingLevelExtraQty(row, eventsTotalById);
      return extra > 0
        ? { row, action: "update", quantity: extra }
        : { row, action: "delete", quantity: 0 };
    });
}

/**
 * Booking-wide supply lines for an order's supply list: every event's amount
 * plus the booking-wide extras (`booking_level`, already extras), keyed by
 * supply item with compatible units (g/kg, ml/l) converted before summing.
 */
function combineOrderSupplyLines(breakdown) {
  /** supplyItemId -> { quantity, unit } */
  const combined = new Map();
  const add = (supplyItemId, quantity, unit) => {
    const n = Number(quantity) || 0;
    if (!supplyItemId || n <= 0) return;
    const prev = combined.get(supplyItemId);
    if (!prev) {
      combined.set(supplyItemId, { quantity: n, unit });
      return;
    }
    prev.quantity += convertSupplyQty(n, unit, prev.unit);
  };
  for (const row of [...breakdown.totals.ingredients, ...breakdown.totals.utensils]) {
    add(row.supply_item_id, row.total, row.unit);
  }
  for (const row of [...breakdown.booking_level.ingredients, ...breakdown.booking_level.utensils]) {
    add(row.supply_item_id, row.quantity, row.unit);
  }
  return [...combined.entries()].map(([supply_item_id, v]) => ({
    supply_item_id,
    quantity: v.quantity,
    unit: v.unit,
  }));
}

module.exports = {
  WEIGHT_UNIT_TO_G,
  VOLUME_UNIT_TO_ML,
  convertSupplyQty,
  sameUnitFamily,
  eventsTotalByIdFromTotals,
  bookingLevelExtraQty,
  planBookingSupplyConversion,
  combineOrderSupplyLines,
};
