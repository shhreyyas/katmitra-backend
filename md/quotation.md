# Quotation Flow — Reference

> **Read this before making any non-trivial change to quotations** — backend, app, or PDF.
> Scope: `katmitra-backend` (API, PDF-adjacent data) + `katmitra-app` (screens, PDF generation, i18n).
> A Quotation is a pre-booking pricing document a business sends a client; once accepted it converts into a real `Booking`. This doc reflects the actual current implementation, not a spec — keep it in sync when the flow changes.

---

## Status

**This phase of quotation work is complete as of 2026-08-26.** Covered in this pass: expiry status + confirm-blocking (client + server), PDF price-hide toggle, Terms & Conditions wiring, itemized additional services, i18n across all quotation screens and PDF text, and several bug fixes (date-sync on edit, fake business identity in the legacy PDF path, per-event date-picker bounds, i18n interpolation syntax for the validity line). Everything above reflects that state. Known gaps that were consciously left out are listed in [§11](#11-known-gaps--deliberate-scope-exclusions) — not oversights, don't "clean them up" without checking first.

If you're picking this doc up again later: re-read it in full before making changes, and update it in the same commit/session as any code change it describes — don't let it drift.

---

## Table of Contents

1. [Data model](#1-data-model)
2. [Status lifecycle](#2-status-lifecycle)
3. [Backend](#3-backend)
4. [App — screen map](#4-app--screen-map)
5. [PDF generation — two pipelines](#5-pdf-generation--two-pipelines)
6. [Terms & Conditions](#6-terms--conditions)
7. [Itemized additional services](#7-itemized-additional-services)
8. [Quotation → Booking conversion](#8-quotation--booking-conversion)
9. [i18n](#9-i18n)
10. [Pricing formula](#10-pricing-formula)
11. [Known gaps / deliberate scope exclusions](#11-known-gaps--deliberate-scope-exclusions)
12. [Checklist before touching this flow](#12-checklist-before-touching-this-flow)

---

## 1. Data model

Four Prisma models, all under `katmitra-backend/prisma/schema.prisma`, deliberately mirroring their `Booking` counterparts (same shape, so a quotation can be copied straight into a booking on conversion):

| Model | Mirrors | Notes |
|---|---|---|
| `Quotation` | `Booking` | Has `status` enum (`DRAFT`/`SALE`/`SENT`/`ACCEPTED`), client fields, discount/service%/tax%, computed `subtotal`/`serviceChargeAmount`/`taxAmount`/`total`, `platePrice`. |
| `QuotationEvent` | `BookingEvent` | One row per event/session (breakfast/lunch/dinner) — a quotation can span several. Has `eventAt`, `guestCount`, `eventSnapshot` (JSON menu snapshot), `eventTotal`. |
| `QuotationMenuItem` | `BookingMenuItem` | Legacy flat mirror of `events[0]`'s menu — kept for backward compatibility; **never the source of truth for pricing**, only `events[].extraServiceLines`/snapshot are. |
| `QuotationExtraServiceLine` | `BookingExtraServiceLine` | Additional/optional services attached to one `QuotationEvent`. Has `titleSnapshot`, `quantity`, `unitPriceSnapshot`, `lineTotal`, `pricingTypeSnapshot`. |
| `QuotationReminder` | `BookingReminder` | Dedup table for push-notification reminders (`@@unique([quotationId, reminderType])`). |

**`Quotation.convertedBookingId` is a soft reference — not a real foreign key.** It's a plain `String? @unique` column with no `@relation` and no DB constraint (confirmed against the migration SQL). `Booking` has no `quotationId` back-reference at all. Referential integrity here is enforced purely by application code in `convertQuotationToBooking` (§8) — don't assume the DB will catch a dangling reference.

---

## 2. Status lifecycle

`QuotationStatus` enum (Prisma, default `SALE`): `DRAFT` → `SALE` → `SENT` → `ACCEPTED`. `ACCEPTED` is terminal — set only by `convertQuotationToBooking`.

**`Expired` is a derived, non-persisted concept**, not a DB status. A quotation is expired when `now` has passed its validity window — 2 days before its **earliest** event, or 30 days after `createdAt` if no event date is set — **and** it isn't `ACCEPTED` (an accepted quotation is never expired; it's already a real booking).

This formula is intentionally duplicated in two places and **must be kept in sync**:
- App: `computeQuotationExpiryDate` / `isQuotationExpired` in `katmitra-app/src/utils/quotationPdf.ts`
- Backend: `isQuotationExpired` in `katmitra-backend/src/controllers/quotationPricingHelpers.js`

| State | Editable (date/menu/everything) | Can Confirm/Approve |
|---|---|---|
| `DRAFT`/`SALE`/`SENT`, not expired | Yes | Yes |
| `DRAFT`/`SALE`/`SENT`, expired | Yes | **Blocked** — client (`isQuotationExpired` check) and server (`convertQuotationToBooking` returns 400 `QUOTATION_EXPIRED`) both reject it |
| `ACCEPTED` | No (`quotationReadOnly` in `newQuotations.tsx`) | N/A — already converted |

There is **no 48-hour edit-cutoff for quotations**, unlike bookings (`bookingDomain.ts`'s `canEditEventOrMenuBeforeEvent`/`BOOKING_EVENT_EDIT_CUTOFF_MS`, never imported by any Quotations file). A quotation stays fully editable — including the date and menu — right up until it's confirmed into a booking; the 48h cutoff only starts applying once it becomes a `Booking`.

When a Confirm/Approve action is blocked by expiry, both entry points (`quotations.tsx` list row, `quotationsPDF.tsx`'s Approve button) show an alert with a direct **Edit** action that navigates straight to `newQuotations.tsx?quotationId=...` — don't remove that without replacing it with an equally direct path, since editing is the only way out of the expired state.

---

## 3. Backend

**Routes** (`src/routes/quotationRoutes.js`), all behind `authMiddleware` + `businessContextMiddleware`:

| Method | Path | Handler |
|---|---|---|
| POST | `/v1/quotations` | `createQuotation` |
| GET | `/v1/quotations` | `listQuotations` |
| GET | `/v1/quotations/:id` | `getQuotation` |
| PATCH | `/v1/quotations/:id` | `updateQuotation` |
| DELETE | `/v1/quotations/:id` | `deleteQuotation` |
| POST | `/v1/quotations/:id/convertToBooking` | `convertQuotationToBooking` |

Admin-only read routes live in `adminRoutes.js` (`GET /admin/v1/quotations[/:id]`, `adminMiddleware` instead of `businessContextMiddleware` — cross-business).

**Controllers**:
- `src/controllers/quotationController.js` — CRUD + `convertQuotationToBooking`. `listQuotations` orders by `[{ eventDate: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }]` — farthest-future event first, no-date quotations last, `updatedAt` breaks ties. (This was flipped once already at the user's request — confirm direction before changing again.)
- `src/controllers/adminQuotationController.js` — read-only, cross-business, used by `katmitra-web`'s `/admin` dashboard.
- `src/controllers/quotationPricingHelpers.js` — pure math, no DB/IO: `computeQuotationTotalFromEvents` (source of truth for subtotal/service/tax/total, always derives from `events[].extraServiceLines`, never the legacy flat `menuItems`) and `isQuotationExpired` (§2).

**Services**: `src/services/quotationReminderService.js` — `processQuotationExpiringReminder` (3 days before `eventDate`) and `processQuotationExpiredReminder` (1 day after), for `DRAFT`/`SENT` quotations with `eventDate` set. Invoked from `eventReminderCron.js` alongside booking-event reminders.

---

## 4. App — screen map

All under `katmitra-app/src/app/(features)/Quotations/` unless noted:

| File | Role |
|---|---|
| `quotations.tsx` | List screen. Filters (All/Saved/Sent/Draft/Accepted/**Expired**), row actions (View/Confirm/Share/Edit via card tap/Delete), share-with/without-price prompt, expiry-blocked Confirm with inline Edit action. |
| `newQuotations.tsx` | Create/edit form (81KB — the biggest file in this feature). `quotationReadOnly` gates editing on `status === "ACCEPTED"` only. Builds the live "Preview PDF" before saving. |
| `selectMenu.tsx` | Per-event menu picker, results flow back via `quotationMenuPickerStore` (Zustand). |
| `editQuotationPricingModal.tsx` | Service%/tax%/discount editor, result passed back via the `quotationPricingDraft` module-level singleton. |
| `quotationsPDF.tsx` | PDF preview/send screen. "Send to Client" (with a "Share without price" toggle) and "Approve Quotation" (→ `convertQuotationToBooking`, with the expiry-guard + Edit alert). |
| `summaryQuotations.tsx` | Read-only summary, reached **only** via a Notifications deep link. Its own "PDF" button hands off to the legacy path below. |
| `../Booking/quotationPreview.tsx` | **Legacy, second PDF path** — misplaced under `Booking/` despite being generic-quotation, reachable only from `summaryQuotations.tsx`. See §5/§11. |

Component libraries: `src/components/quotations/QuotationsParts.tsx` (list card, filter tabs, status-color legend), `src/components/quotationPdf/QuotationsPdfParts.tsx` (native on-screen PDF preview — `DocumentCard`, `EventBlockCard`), `src/components/quotationSummary/SummaryQuotationsParts.tsx`, `src/components/quotation/QuotationDocumentCard.tsx` (legacy path's own preview card).

---

## 5. PDF generation — two pipelines

**This is the single most important thing to know before touching quotation PDFs.** There are two entirely independent HTML-generation code paths in `katmitra-app/src/utils/quotationPdf.ts` — a change to one does **not** apply to the other.

### Pipeline B — primary, active path

`quotationDtoToPdfDocument` (from a saved `QuotationDto`) / `buildMultiEventQuotationPdfDocument` (from live in-editing form state) → `buildQuotationPdfDocumentHtml` (the exported PDF's HTML) + `QuotationsPdfParts.tsx`'s `DocumentCard`/`EventBlockCard` (the in-app native preview — same `QuotationPdfDocument` shape, rendered as RN views instead of HTML). Both consumers read the same `printMeta` (localized labels) and `termsLines`.

Used by: `quotationsPDF.tsx`, `quotations.tsx` (list Share icon), `newQuotations.tsx` ("Preview PDF" before saving).

`shareQuotationPdfFile(doc, logos, { hidePricing })` — when `hidePricing` is true, strips per-item rate/plate-price/Subtotal-Service-Tax-Total block, and drops the two pricing-mention Terms lines **by index** (not text-matching, so it works across languages) from the default terms only — a business's own custom terms text is never auto-filtered.

### Pipeline A — legacy, secondary path

`buildQuotationHtml` / `printQuotationToPdf`, used **only** by `Booking/quotationPreview.tsx`. Has **no `printMeta`/language parameter at all** — every label is hardcoded English, and it has no Terms & Conditions section. It was fixed once to use the real business identity (previously hardcoded a fake `"Gourmet Catering"`) but was **not** brought up to feature-parity with Pipeline B (localization, terms, itemized extras) — that was an explicit scope decision, see §11.

---

## 6. Terms & Conditions

Sourced from the business's own `Business.termsAndConditions` (Settings → Terms & Conditions) — the **same field** already used for the Booking PDF (`bookingPdf.ts`). Passed as `businessDetails.terms` into `quotationDtoToPdfDocument`, or `companyTerms` into `buildMultiEventQuotationPdfDocument` directly.

Behavior (`buildQuotationTermsLineSets` in `quotationPdf.ts`): if the business has set custom terms, use them (split by newline) instead of the 5 localized defaults (`t("quotationPdfDefaultTerms")`). The validity line (`t("quotationPdfTermsValidity")`, `__DATE__` substituted — **not** `%{date}` or `{{date}}`, see the i18n note below) is **always** appended regardless — it's derived per-quotation data, not editable terms text. This mirrors `bookingPdf.ts`'s pattern except quotations always show *something* (the defaults) when the business hasn't customized, whereas Booking shows no terms section at all in that case — that's deliberate, keep it that way unless asked to change it.

Pipeline A has no equivalent — no terms section exists there at all (§5, §11).

---

## 7. Itemized additional services

Each `QuotationEvent`'s selected extra services are itemized (title, quantity when meaningful, line total) rather than collapsed into one "Additional services: ₹X" row — in the **PDF only** (both the exported HTML and the in-app preview card), via `QuotationPdfEventBlock.extraServiceLines`.

- For a **saved** quotation: sourced straight from `QuotationEventDto.extra_service_lines` (`title_snapshot`) — no extra lookup needed.
- For the **live, unsaved "Preview PDF"** in `newQuotations.tsx`: sourced from `serviceCatalogById` (a `Map` built from the already-fetched `serviceCatalog` state) joined against each event's `serviceSelection`.

**Deliberately not itemized**: `newQuotations.tsx`'s own on-screen "Estimated event total" card still shows the single aggregate row — the editable "Additional services" section directly above it already shows exactly which services (with quantity) are selected via checkboxes, so repeating that breakdown in the read-only estimate card was redundant. The itemized version for that specific card exists as a **commented-out block** right next to the active code (search `extraServiceItemsForEvent(ev).map` inside a comment) — restore it there if this decision changes, don't reimplement from scratch.

Quantity is only shown when `> 1` — this naturally only ever fires for `PER_UNIT`-priced services, since `FIXED`/`PER_GUEST` services aren't quantity-editable and always stay at `1`.

---

## 8. Quotation → Booking conversion

`POST /v1/quotations/:id/convertToBooking` (`convertQuotationToBooking` in `quotationController.js`) — idempotent: if `existing.convertedBookingId` is already set, it just re-loads and returns that `Booking`. Otherwise, inside one transaction: creates `Booking` (status `CONFIRMED`, unique booking code), copies `QuotationMenuItem`→`BookingMenuItem`, `QuotationEvent`→`BookingEvent`, `QuotationExtraServiceLine`→`BookingExtraServiceLine` (remapping event ids via an `eventIdMap`), computes `totalDue`, then stamps the source `Quotation` with `status: "ACCEPTED"`, `convertedBookingId`, `convertedAt`.

Rejects with 400 `QUOTATION_EXPIRED` when `isQuotationExpired(existing)` — added as defense-in-depth alongside the client-side guard in `quotations.tsx`/`quotationsPDF.tsx` (§2).

Two UI entry points both call the same `convertQuotationToBooking` service function: `quotations.tsx`'s list-row "Confirm" and `quotationsPDF.tsx`'s "Approve Quotation" button.

---

## 9. i18n

Every Quotation screen and all PDF chrome (Pipeline B only, §5) routes through `t()` / `printMeta` — `en.json`/`hi.json`/`gu.json` must always have **exact key parity** (verify below). Key prefixes by area, so a new key's home is predictable:

| Prefix | Area |
|---|---|
| `quotationPdf*` | PDF chrome, terms, header labels (Pipeline B, shared by HTML + native preview) |
| `quotations*` (list-scoped: `quotationsList*`, `quotationsShare*`, `quotationsConfirm*`, `quotationsDelete*`, `quotationsExpired*`, `quotationsFilter*`, `quotationsLegend*`, `quotationsCard*`) | `quotations.tsx` + `QuotationsParts.tsx` |
| `quotationsPdf*` | `quotationsPDF.tsx` screen chrome (distinct from `quotationPdf*` above — one's the screen, one's the document) |
| `summaryQuotations*` | `summaryQuotations.tsx` |
| `newQuotations*` | `newQuotations.tsx` form/validation/pricing |
| `quotationPreview*` | Legacy `Booking/quotationPreview.tsx` on-screen UI only — its PDF output itself is **not** localized (§5) |

Verify key parity after any change:
```bash
cd katmitra-app && node -e "
const en=require('./src/assets/localization/languages/en.json');
const hi=require('./src/assets/localization/languages/hi.json');
const gu=require('./src/assets/localization/languages/gu.json');
const ek=new Set(Object.keys(en));
console.log('missing in hi:', [...ek].filter(k=>!(k in hi)));
console.log('missing in gu:', [...ek].filter(k=>!(k in gu)));
"
```
Interpolation uses `i18n-js`'s `%{param}` syntax (e.g. `t("quotationsConfirmMessage", { quoteId })`), never manual string concatenation for translated sentences — **except** `quotationPdfTermsValidity`, which deliberately uses a plain `__DATE__` token instead. That key is fetched via `t(key)` with **no params**, because the real date isn't known until deep inside `buildQuotationTermsLineSets` (a pure builder with no `t()` of its own) — and i18n-js interpolates *both* `%{...}` **and** `{{...}}` tokens unconditionally, even with no params supplied, producing `[missing "<token>" value]` rather than leaving it untouched. A subsequent manual `.replace()` on that text then finds and clobbers the literal token still sitting inside the missing-value message, producing garbled output like `[missing "26 August 2026" value]` — this shipped twice in a row because the first fix (`%{date}` → `{{date}}`) was based on an assumption about i18n-js's syntax instead of testing it, and `{{...}}` turned out to be recognized too. If you ever add another "resolve the real value later, outside `t()`" placeholder: use a token i18n-js's interpolator won't match (e.g. `__DATE__`), and **verify it against the actual library** before trusting it — a two-line `node -e "..."` script with `i18n-js`'s `I18n` class and the real JSON file, like the one used to catch this, is enough. Don't reason about interpolation syntax from memory.

---

## 10. Pricing formula

`computeQuotationPricingBreakdown` (app, `src/utils/quotationPricing.ts`) mirrors `computeQuotationTotalFromEvents` (backend, `quotationPricingHelpers.js`): per-event **food** (`guestCount × pricePerPlate`) + **extras** (sum of that event's extra-service line totals) → summed into one pre-tax subtotal across all events → one shared `serviceChargePct`/`taxPct`/`discount` applied once across the whole quotation (not per-event). If you change one side's math, change the other — they're independently implemented, not a shared module (different languages/repos), and there's no test catching drift between them.

---

## 11. Known gaps / deliberate scope exclusions

These were surfaced and consciously left as-is — don't "fix" them as a side effect of unrelated work without raising it first:

- **Pipeline A** (`Booking/quotationPreview.tsx`'s PDF) has no localization, no Terms & Conditions section, and no price-hide equivalent. Extending it to match Pipeline B is a real chunk of work (adding a `printMeta`/language mechanism from scratch), not a quick wire-up.
- `Booking/newBooking.tsx` accepts an optional `quotationId` param to pre-fill a fresh booking form from a quotation — but no in-app navigation call was found that actually passes it. Likely dead/unreachable code; never confirmed or removed.
- `Booking/quotationPreview.tsx` lives under the `Booking/` folder despite being a generic quotation PDF screen — never relocated to `Quotations/`.
- No automated tests exist for either project, and nothing in this feature has been verified on a running simulator/device from within an agent session (no interactive driver available) — treat all of the above as code-reviewed, not QA'd, until confirmed on-device.

---

## 12. Checklist before touching this flow

- [ ] Does this change need to touch **both** PDF pipelines (§5), or just Pipeline B? Say so explicitly either way — don't silently leave Pipeline A behind without noting it.
- [ ] If it touches the expiry formula, update **both** `quotationPdf.ts` (app) and `quotationPricingHelpers.js` (backend) — §2.
- [ ] If it adds any new user-facing string, add it to **all three** `en.json`/`hi.json`/`gu.json` with real translations (not copies of the English), and re-run the key-parity check in §9.
- [ ] If it touches pricing, update **both** `quotationPricing.ts` (app) and `quotationPricingHelpers.js` (backend) — §10.
- [ ] Does the change apply to a saved quotation, the live "Preview PDF" (unsaved form state), or both? They're fed from different data sources (§7 is a good example of this split).
