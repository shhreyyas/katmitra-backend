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

const QUOTATION_EXPIRY_LEAD_MS = 2 * 24 * 60 * 60 * 1000; // valid until 2 days before the event
const QUOTATION_EXPIRY_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000; // no event date set: 30 days after issue

/** Earliest `eventAt` across a quotation's events, falling back to the legacy single `eventDate`. */
function earliestQuotationEventDate(quotation) {
  const dates = (quotation.events || [])
    .map((ev) => ev.eventAt)
    .filter((d) => d != null)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (dates.length > 0) {
    return dates.reduce((earliest, d) => (d.getTime() < earliest.getTime() ? d : earliest));
  }
  return quotation.eventDate ? new Date(quotation.eventDate) : null;
}

/**
 * True once a quotation's validity window has passed: 2 days before its earliest event,
 * or 30 days after it was issued when no event date is set. Mirrors the app's PDF expiry
 * label (`formatQuotationPdfExpiresTwoDaysBeforeEvent` in quotationPdf.ts) so the two never
 * disagree. An ACCEPTED quotation is never expired — it has already become a Booking.
 */
function isQuotationExpired(quotation) {
  if (String(quotation.status || "").toUpperCase() === "ACCEPTED") return false;
  const issuedAt = quotation.createdAt ? new Date(quotation.createdAt) : new Date();
  const issuedSafe = Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt;
  const eventDate = earliestQuotationEventDate(quotation);
  const expiry =
    eventDate != null
      ? new Date(Math.max(eventDate.getTime() - QUOTATION_EXPIRY_LEAD_MS, issuedSafe.getTime()))
      : new Date(issuedSafe.getTime() + QUOTATION_EXPIRY_FALLBACK_MS);
  return Date.now() > expiry.getTime();
}

module.exports = {
  deriveQuotationEventFoodSubtotal,
  deriveQuotationEventExtrasSubtotal,
  computeQuotationTotalFromEvents,
  isQuotationExpired,
};
