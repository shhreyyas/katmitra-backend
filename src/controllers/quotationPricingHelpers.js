const { num, roundInr } = require("./bookingPricingHelpers");

/** Food-only amount from a QuotationEvent's snapshot plate price × guests. */
function deriveQuotationEventFoodSubtotal(ev) {
  const guests = Math.max(0, Number(ev?.guestCount ?? 0) || 0);
  const snap = ev?.eventSnapshot;
  const snapshotPrice = Number(snap?.price_per_plate ?? snap?.pricePerPlate ?? 0) || 0;
  return guests * snapshotPrice;
}

/** Extra-services total for a single QuotationEvent from its nested service lines. */
function deriveQuotationEventExtrasSubtotal(ev) {
  return (ev?.extraServiceLines || []).reduce((s, l) => s + num(l.lineTotal), 0);
}

/**
 * Sums per-event food + per-event extra service lines, then applies service%/tax%/discount.
 * The single source of truth for Quotation.subtotal/serviceChargeAmount/taxAmount/total —
 * always derive from `events[].extraServiceLines`, never from the legacy flat menuItems list.
 * Returns foodSubtotal and extraCharges as separate fields for richer serialization.
 */
function computeQuotationTotalFromEvents(quotation) {
  const events = quotation.events || [];
  let foodSum = 0;
  let extrasSum = 0;
  for (const ev of events) {
    foodSum += deriveQuotationEventFoodSubtotal(ev);
    extrasSum += deriveQuotationEventExtrasSubtotal(ev);
  }

  const preTaxSubtotal = roundInr(foodSum + extrasSum);
  if (preTaxSubtotal <= 0) {
    return { subtotal: 0, foodSubtotal: 0, extraCharges: 0, serviceChargeAmount: 0, taxAmount: 0, total: 0 };
  }

  const servicePct = num(quotation.serviceChargePct);
  const serviceChargeAmount = roundInr(preTaxSubtotal * (servicePct / 100));

  const taxPct = num(quotation.taxPct);
  const taxAmount = roundInr(preTaxSubtotal * (taxPct / 100));

  const disc = roundInr(num(quotation.discountAmount));
  const total = Math.max(0, roundInr(preTaxSubtotal + serviceChargeAmount + taxAmount - disc));

  return {
    subtotal: preTaxSubtotal,
    foodSubtotal: roundInr(foodSum),
    extraCharges: roundInr(extrasSum),
    serviceChargeAmount,
    taxAmount,
    total,
  };
}

module.exports = {
  deriveQuotationEventFoodSubtotal,
  deriveQuotationEventExtrasSubtotal,
  computeQuotationTotalFromEvents,
};
