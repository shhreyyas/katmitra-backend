function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Whole rupees (no paise) for booking totals shown to customers. */
function roundInr(v) {
  return Math.round(num(v));
}

/** Food-only amount from snapshot plate × guests (ignores `eventTotal`). */
function deriveEventFoodSubtotal(ev) {
  const guests = Math.max(0, Number(ev?.guestCount ?? 0) || 0);
  const snap = ev?.eventSnapshot;
  const snapshotPrice =
    Number(snap?.price_per_plate ?? snap?.pricePerPlate ?? 0) || 0;
  return guests * snapshotPrice;
}

/** Stored event total when set, otherwise food-only. */
function deriveEventSubtotal(ev) {
  if (ev?.eventTotal != null) return num(ev.eventTotal);
  return deriveEventFoodSubtotal(ev);
}

/**
 * Food subtotal + service/tax/discount + all extra service lines (no double-count).
 */
function computeBookingTotalDueFromEvents(booking) {
  const events = booking.events || [];
  let foodSum = 0;
  for (const ev of events) {
    foodSum += deriveEventFoodSubtotal(ev);
  }
  const extrasSum = (booking.extraServiceLines || []).reduce(
    (s, l) => s + num(l.lineTotal),
    0,
  );
  const preTaxSubtotal = roundInr(foodSum + extrasSum);
  if (preTaxSubtotal <= 0) return 0;

  const servicePct = num(booking.serviceChargePct);
  let serviceAmt = roundInr(
    servicePct > 0
      ? preTaxSubtotal * (servicePct / 100)
      : num(booking.serviceChargeAmount),
  );

  const taxPct = num(booking.taxPct);
  let taxAmt = roundInr(
    taxPct > 0 ? preTaxSubtotal * (taxPct / 100) : num(booking.taxAmount),
  );

  const disc = roundInr(num(booking.discountAmount));
  return Math.max(0, roundInr(preTaxSubtotal + serviceAmt + taxAmt - disc));
}

function paymentStatusFromAmounts(amountPaid, totalDue) {
  const paid = num(amountPaid);
  const due = num(totalDue);
  if (paid <= 0) return "PENDING";
  if (paid >= due - 0.01) return "RECEIVED";
  return "PARTIAL";
}

module.exports = {
  num,
  roundInr,
  deriveEventFoodSubtotal,
  deriveEventSubtotal,
  computeBookingTotalDueFromEvents,
  paymentStatusFromAmounts,
};
