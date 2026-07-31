const { num, roundInr } = require("./bookingPricingHelpers");

/** Food-only amount from a QuotationEvent's snapshot plate price × guests. */
function deriveQuotationEventFoodSubtotal(ev) {
  const guests = Math.max(0, Number(ev?.guestCount ?? 0) || 0);
  const snap = ev?.eventSnapshot;
  const snapshotPrice = Number(snap?.price_per_plate ?? snap?.pricePerPlate ?? 0) || 0;
  return guests * snapshotPrice;
}

/**
 * Sums per-event food + all extra service lines, then applies service%/tax%/discount.
 * The single source of truth for Quotation.subtotal/serviceChargeAmount/taxAmount/total —
 * always derive from `events`/`extraServiceLines`, never from the legacy flat menuItems list.
 */
function computeQuotationTotalFromEvents(quotation) {
  const events = quotation.events || [];
  let foodSum = 0;
  for (const ev of events) foodSum += deriveQuotationEventFoodSubtotal(ev);

  const extrasSum = (quotation.extraServiceLines || []).reduce(
    (s, l) => s + num(l.lineTotal),
    0,
  );

  const preTaxSubtotal = roundInr(foodSum + extrasSum);
  if (preTaxSubtotal <= 0) {
    return { subtotal: 0, serviceChargeAmount: 0, taxAmount: 0, total: 0 };
  }

  const servicePct = num(quotation.serviceChargePct);
  const serviceChargeAmount = roundInr(preTaxSubtotal * (servicePct / 100));

  const taxPct = num(quotation.taxPct);
  const taxAmount = roundInr(preTaxSubtotal * (taxPct / 100));

  const disc = roundInr(num(quotation.discountAmount));
  const total = Math.max(0, roundInr(preTaxSubtotal + serviceChargeAmount + taxAmount - disc));

  return { subtotal: preTaxSubtotal, serviceChargeAmount, taxAmount, total };
}

module.exports = {
  deriveQuotationEventFoodSubtotal,
  computeQuotationTotalFromEvents,
};
