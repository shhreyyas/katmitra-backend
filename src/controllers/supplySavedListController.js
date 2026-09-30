const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");
const {
  buildFullBookingSupplyBreakdown,
  convertSupplyQty,
} = require("./supplyController");
const { resolveFunctionTypeLabel } = require("../utils/functionTypeLabels");

const VALID_TYPES_FILTER = { type: "INGREDIENT" };

function supplyVisibilityOrBranches(businessId, userId) {
  return [
    { businessId, OR: [{ isGlobal: true }, { createdByUserId: userId }] },
    { businessId: null, OR: [{ createdByUserId: userId }, { isGlobal: true }] },
    { createdByUserId: userId },
  ];
}

function utensilStockExceededMessage(source, requestedQty) {
  if (source.type !== "UTENSIL" || source.availableCount == null) return null;
  const q = parseInt(String(requestedQty), 10);
  const qty = Number.isFinite(q) ? q : 0;
  if (qty > source.availableCount) {
    return "Quantity cannot exceed remaining stock for this utensil";
  }
  return null;
}

const MAX_LIST_QTY = 1000000;

/**
 * Saved-list ingredient quantity: keeps decimals (1.5 kg) and large gram
 * amounts (15000 g); anything missing/invalid falls back to 1.
 */
function normalizeListQty(raw) {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(MAX_LIST_QTY, Math.round(n * 1000) / 1000);
}

/** Utensils are counted in whole pieces. */
function normalizeUtensilQty(raw) {
  return Math.max(1, Math.min(MAX_LIST_QTY, Math.round(Number(raw)) || 1));
}

function formatTitleDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(dt);
}

/**
 * "Customer - Function type" (e.g. "Shreyas Tarar - Wedding Reception"),
 * localized to the request language. Falls back to the date only when
 * neither a customer name nor a function type is available.
 */
function buildSavedListTitle({ booking, at, language }) {
  const customerName = booking?.customerName ? String(booking.customerName).trim() : "";
  const functionLabel = booking?.functionType
    ? resolveFunctionTypeLabel(booking.functionType, language) || ""
    : "";
  const parts = [customerName, functionLabel].filter(Boolean);
  if (parts.length > 0) return parts.join(" - ");
  return formatTitleDate(at ?? new Date());
}

function serializeSavedItem(row, lang) {
  const localized = normalizeLocalizedName(row.nameSnapshot) || { en: "" };
  return {
    supply_item_id: row.supplyItemId,
    quantity: row.quantity,
    unit: row.unit,
    category: row.categorySlug,
    name: resolveLocalizedName(row.nameSnapshot, lang),
    name_i18n: localized,
  };
}

function normalizeCustomTitle(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return value.slice(0, 512);
}

/**
 * Resolves a set of {supply_item_id, quantity, unit} lines into a real,
 * persisted SupplySavedList (mirrors createSupplySavedList's resolution
 * logic, minus the request/response plumbing). Returns null if none of the
 * lines resolve to a visible, active INGREDIENT supply item.
 */
async function persistAutoSupplyList({
  businessId,
  userId,
  language,
  bookingEventId = null,
  bookingId = null,
  booking,
  lines,
}) {
  // An order list is created even with no items yet — the caterer can add
  // them later from the Supply Lists screen.
  const allowEmpty = Boolean(bookingId);
  const ids = [...new Set(lines.map((l) => l.supply_item_id).filter(Boolean))];
  if (ids.length === 0 && !allowEmpty) return null;

  const supplyRows = await prisma.supplyItem.findMany({
    where: {
      id: { in: ids },
      isActive: true,
      ...VALID_TYPES_FILTER,
      OR: supplyVisibilityOrBranches(businessId, userId),
    },
    include: { category: true },
  });
  const byId = new Map(supplyRows.map((row) => [row.id, row]));
  const validLines = lines.filter((l) => byId.has(l.supply_item_id));
  if (validLines.length === 0 && !allowEmpty) return null;

  const categorySlugsSet = new Set();
  for (const line of validLines) {
    categorySlugsSet.add(byId.get(line.supply_item_id).categorySlug);
  }
  const catRows = await prisma.supplyItemCategory.findMany({
    where: { slug: { in: [...categorySlugsSet] }, isActive: true },
  });
  const catBySlug = new Map(catRows.map((c) => [c.slug, c]));
  const categoryLabels = [...categorySlugsSet]
    .sort()
    .map((slug) =>
      catBySlug.has(slug) ? resolveLocalizedName(catBySlug.get(slug).name, language) : slug,
    );
  const categoriesLabel = categoryLabels.length <= 1 ? categoryLabels[0] ?? "" : categoryLabels.join(", ");

  const title = buildSavedListTitle({ booking, at: new Date(), language });

  return prisma.supplySavedList.create({
    data: {
      businessId,
      createdByUserId: userId ?? null,
      title,
      bookingEventId,
      bookingId,
      categoriesLabel,
      autoSync: Boolean(bookingId),
      items: {
        create: validLines.map((line) => {
          const source = byId.get(line.supply_item_id);
          const qty = normalizeListQty(line.quantity);
          return {
            supplyItemId: source.id,
            quantity: qty,
            unit: String(line.unit || source.defaultUnit || "kg"),
            categorySlug: source.categorySlug,
            nameSnapshot: source.name,
          };
        }),
      },
    },
  });
}

/**
 * Booking-wide ingredient lines for an order-linked list, from the same
 * breakdown the full booking PDF / Documents sheet use: recipe ingredients
 * recomputed from each event's current guest count, event-level extras not
 * covered by a recipe, plus manually added booking-level items (which
 * replace the calculated figure for the same item). Lines are
 * keyed by supply item, converting compatible units (g/kg, ml/l) before
 * summing so 500 g + 2 kg never becomes "502 g".
 */
async function computeOrderSupplyLines({ businessId, userId, language, bookingId }) {
  const breakdown = await buildFullBookingSupplyBreakdown({
    bookingId,
    businessId,
    userId,
    language,
  });
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
  // A manually added booking-level row for an item is authoritative over the
  // auto-calculated figure (same rule as the Booking Supply List screen).
  const manualIds = new Set(breakdown.booking_level.ingredients.map((r) => r.supply_item_id));
  for (const row of breakdown.totals.ingredients) {
    if (manualIds.has(row.supply_item_id)) continue;
    add(row.supply_item_id, row.total, row.unit);
  }
  for (const row of breakdown.booking_level.ingredients) add(row.supply_item_id, row.quantity, row.unit);
  return [...combined.entries()].map(([supply_item_id, v]) => ({
    supply_item_id,
    quantity: v.quantity,
    unit: v.unit,
  }));
}

/**
 * Creates the order supply list for a confirmed booking — ONE combined list
 * for all its events, created even when the order has no ingredients yet so
 * the caterer can add them later from the Supply Lists screen. The list
 * mirrors the booking (see syncOrderSupplyList) and is removed with it (see
 * pruneInactiveOrderSupplyLists). Called from confirmBooking and from the
 * Supply Lists backfill. Best-effort — failures must never fail the caller.
 */
async function autoSaveSupplyListsForConfirmedBooking({ businessId, userId, language, booking }) {
  const events = Array.isArray(booking?.events) ? booking.events : [];

  const existing = await prisma.supplySavedList.findFirst({
    where: { businessId, bookingId: booking.id },
    select: { id: true },
  });
  if (existing) return;

  try {
    const lines = await computeOrderSupplyLines({
      businessId,
      userId,
      language,
      bookingId: booking.id,
    });
    await persistAutoSupplyList({
      businessId,
      userId,
      language,
      bookingId: booking.id,
      booking: {
        customerName: booking.customerName,
        // Booking-level type first; older bookings only carry it per event.
        functionType:
          booking.functionType ||
          events.find((e) => e.functionType)?.functionType ||
          null,
      },
      lines,
    });
  } catch (err) {
    // Another request created this order's list first — nothing to do.
    if (err?.code === "P2002") return;
    console.warn(
      `autoSaveSupplyListsForConfirmedBooking: failed for booking ${booking.id}:`,
      err.message,
    );
  }
}

/**
 * Regenerates an order list's items from the booking's current menu, guest
 * counts and supply rows (an order with nothing yet gets an empty list).
 * Best-effort: on any failure the previously saved items are served as-is.
 */
async function syncOrderSupplyList({ list, businessId, userId, language }) {
  if (!list?.autoSync || !list.bookingId) return;
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: list.bookingId, businessId },
      select: { status: true },
    });
    if (!booking || booking.status === "CANCELLED") return;

    const lines = await computeOrderSupplyLines({
      businessId,
      userId,
      language,
      bookingId: list.bookingId,
    });
    const ids = [...new Set(lines.map((l) => l.supply_item_id))];
    const supplyRows = ids.length
      ? await prisma.supplyItem.findMany({
          where: {
            id: { in: ids },
            isActive: true,
            ...VALID_TYPES_FILTER,
            OR: supplyVisibilityOrBranches(businessId, userId),
          },
        })
      : [];
    const byId = new Map(supplyRows.map((r) => [r.id, r]));
    const validLines = lines.filter((l) => byId.has(l.supply_item_id));
    const nextItems = validLines.map((line) => {
      const source = byId.get(line.supply_item_id);
      return {
        supplyItemId: source.id,
        quantity: normalizeListQty(line.quantity),
        unit: String(line.unit || source.defaultUnit || "kg"),
        categorySlug: source.categorySlug,
        nameSnapshot: source.name,
      };
    });

    // Skip the rewrite when the items haven't changed.
    const currentItems = await prisma.supplySavedListItem.findMany({
      where: { listId: list.id },
      select: { supplyItemId: true, quantity: true, unit: true },
    });
    const itemKey = (i) => `${i.supplyItemId}\t${i.quantity}\t${i.unit}`;
    const currentKeys = currentItems.map(itemKey).sort().join("\n");
    const nextKeys = nextItems.map(itemKey).sort().join("\n");
    if (currentKeys === nextKeys) {
      // Mark as checked so orderListNeedsSync doesn't keep re-running it.
      await prisma.supplySavedList.update({ where: { id: list.id }, data: { updatedAt: new Date() } });
      return;
    }

    const categorySlugs = [...new Set(validLines.map((l) => byId.get(l.supply_item_id).categorySlug))];
    const catRows = await prisma.supplyItemCategory.findMany({
      where: { slug: { in: categorySlugs }, isActive: true },
    });
    const catBySlug = new Map(catRows.map((c) => [c.slug, c]));
    const categoriesLabel = categorySlugs
      .sort()
      .map((slug) => (catBySlug.has(slug) ? resolveLocalizedName(catBySlug.get(slug).name, language) : slug))
      .join(", ");

    await prisma.$transaction(async (tx) => {
      await tx.supplySavedListItem.deleteMany({ where: { listId: list.id } });
      await tx.supplySavedList.update({
        where: { id: list.id },
        data: {
          categoriesLabel,
          items: { create: nextItems },
        },
      });
    });
  } catch (err) {
    console.warn(`syncOrderSupplyList: failed for list ${list.id}:`, err.message);
  }
}

/** Syncs a booking's order list, if it has one. Best-effort. */
async function syncOrderSupplyListForBooking({ bookingId, businessId, userId, language }) {
  try {
    const list = await prisma.supplySavedList.findFirst({
      where: { businessId, bookingId },
      select: { id: true, bookingId: true, autoSync: true },
    });
    if (list) await syncOrderSupplyList({ list, businessId, userId, language });
  } catch (err) {
    console.warn(`syncOrderSupplyListForBooking: failed for booking ${bookingId}:`, err.message);
  }
}

/**
 * True when the booking (or its events / supply rows) changed after the
 * order list was last synced — only then does opening the list need to wait
 * for a sync. Recipe edits are picked up by the Supply Lists background sync.
 */
async function orderListNeedsSync(list) {
  const since = list.updatedAt;
  if (!since) return true;
  const changed = { updatedAt: { gt: since } };
  const [booking, event, eventRow, bookingRow] = await Promise.all([
    prisma.booking.count({ where: { id: list.bookingId, ...changed } }),
    prisma.bookingEvent.count({ where: { bookingId: list.bookingId, ...changed } }),
    prisma.bookingEventSupplyItem.count({ where: { bookingEvent: { bookingId: list.bookingId }, ...changed } }),
    prisma.bookingSupplyItem.count({ where: { bookingId: list.bookingId, ...changed } }),
  ]);
  return booking + event + eventRow + bookingRow > 0;
}

/** An order list is removed the day after the order's last event. */
const ORDER_LIST_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes order supply lists whose order is no longer active: cancelled,
 * completed, or whose last event ended more than a day ago. (Deleting the
 * booking itself cascades at the DB level.)
 */
async function pruneInactiveOrderSupplyLists(businessId) {
  const cutoff = new Date(Date.now() - ORDER_LIST_GRACE_MS);
  const lists = await prisma.supplySavedList.findMany({
    where: { businessId, bookingId: { not: null } },
    select: {
      id: true,
      booking: {
        select: {
          status: true,
          completedAt: true,
          events: { select: { eventAt: true } },
        },
      },
    },
  });
  const staleIds = lists
    .filter(({ booking }) => {
      if (!booking) return true;
      if (booking.status !== "CONFIRMED" || booking.completedAt) return true;
      const times = booking.events
        .map((e) => (e.eventAt ? new Date(e.eventAt).getTime() : NaN))
        .filter((t) => !Number.isNaN(t));
      return times.length > 0 && Math.max(...times) < cutoff.getTime();
    })
    .map((l) => l.id);
  if (staleIds.length) {
    await prisma.supplySavedList.deleteMany({ where: { id: { in: staleIds } } });
  }
}

/** Removes a booking's order list right away (order completed / cancelled). */
async function deleteOrderSupplyListForBooking(bookingId) {
  try {
    await prisma.supplySavedList.deleteMany({ where: { bookingId } });
  } catch (err) {
    console.warn(`deleteOrderSupplyListForBooking: failed for booking ${bookingId}:`, err.message);
  }
}

/**
 * Keeps the Supply Lists screen's order lists in step with the business's
 * orders: prunes inactive ones, creates a list for every active confirmed
 * order that lacks one (including orders confirmed with no ingredients),
 * and regenerates every active order list so recipe / guest count /
 * supply edits made anywhere show up. Best-effort.
 */
const RECONCILE_MIN_INTERVAL_MS = 5 * 1000;
/** businessId -> in-flight reconcile promise */
const reconcileInFlight = new Map();
/** businessId -> last finished reconcile time */
const reconcileLastRun = new Map();

/**
 * Runs reconcileOrderSupplyLists at most once at a time per business, and
 * not again within RECONCILE_MIN_INTERVAL_MS unless `force` is set. Parallel
 * list requests share the same run, so they can't both create a list for
 * the same order.
 */
function reconcileOrderSupplyListsOnce({ businessId, userId, language, force = false }) {
  const running = reconcileInFlight.get(businessId);
  if (running) return running;
  const last = reconcileLastRun.get(businessId) ?? 0;
  if (!force && Date.now() - last < RECONCILE_MIN_INTERVAL_MS) return Promise.resolve();
  const run = reconcileOrderSupplyLists({ businessId, userId, language }).finally(() => {
    reconcileInFlight.delete(businessId);
    reconcileLastRun.set(businessId, Date.now());
  });
  reconcileInFlight.set(businessId, run);
  return run;
}

/** businessId -> running background sync of that business's order lists */
const backgroundSyncs = new Map();
const SYNC_CONCURRENCY = 3;

/** Runs `worker` over `items` with at most `limit` in flight at once. */
async function runWithConcurrency(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Regenerates every listed order list off the request path — recomputing an
 * order's supply takes about a second, so the Supply Lists response must
 * not wait for it. Updated counts show on the next load.
 */
function syncOrderListsInBackground({ lists, businessId, userId, language }) {
  if (lists.length === 0 || backgroundSyncs.has(businessId)) return;
  const run = runWithConcurrency(lists, SYNC_CONCURRENCY, (list) =>
    syncOrderSupplyList({ list, businessId, userId, language }),
  )
    .catch((err) => console.warn("syncOrderListsInBackground:", err.message))
    .finally(() => backgroundSyncs.delete(businessId));
  backgroundSyncs.set(businessId, run);
}

async function reconcileOrderSupplyLists({ businessId, userId, language }) {
  try {
    await pruneInactiveOrderSupplyLists(businessId);

    const cutoff = new Date(Date.now() - ORDER_LIST_GRACE_MS);
    const bookings = await prisma.booking.findMany({
      where: { businessId, status: "CONFIRMED", completedAt: null },
      select: {
        id: true,
        customerName: true,
        functionType: true,
        events: { select: { id: true, eventAt: true, functionType: true } },
        supplySavedLists: { select: { id: true, bookingId: true, autoSync: true } },
      },
    });
    const toSync = [];
    for (const booking of bookings) {
      const times = booking.events
        .map((e) => (e.eventAt ? new Date(e.eventAt).getTime() : NaN))
        .filter((t) => !Number.isNaN(t));
      if (times.length > 0 && Math.max(...times) < cutoff.getTime()) continue;

      let list = booking.supplySavedLists[0];
      if (!list) {
        // Create the missing list right away (empty) so it shows in this
        // response; the background sync fills in its items.
        try {
          list = await persistAutoSupplyList({
            businessId,
            userId,
            language,
            bookingId: booking.id,
            booking: {
              customerName: booking.customerName,
              functionType:
                booking.functionType ||
                booking.events.find((e) => e.functionType)?.functionType ||
                null,
            },
            lines: [],
          });
        } catch (err) {
          if (err?.code !== "P2002") throw err;
          continue;
        }
      }
      if (list) toSync.push(list);
    }
    syncOrderListsInBackground({ lists: toSync, businessId, userId, language });
  } catch (err) {
    console.warn("reconcileOrderSupplyLists:", err.message);
  }
}

async function createSupplySavedList(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const lang = getRequestedLanguage(req);
    const body = req.body || {};
    const bookingEventId = body.booking_event_id
      ? String(body.booking_event_id).trim()
      : null;
    const payload = Array.isArray(body.items) ? body.items : [];

    if (!businessId) {
      return errorResponse(res, "Business required", 200, "VALIDATION_ERROR");
    }
    if (payload.length === 0) {
      return errorResponse(res, "At least one item is required", 200, "VALIDATION_ERROR");
    }

    let booking = null;
    let bookingEvent = null;
    if (bookingEventId) {
      bookingEvent = await prisma.bookingEvent.findFirst({
        where: { id: bookingEventId },
        include: {
          booking: {
            select: {
              id: true,
              businessId: true,
              customerName: true,
            },
          },
        },
      });
      if (
        !bookingEvent ||
        bookingEvent.booking.businessId !== businessId
      ) {
        return errorResponse(res, "Event not found", 404, "NOT_FOUND");
      }
      booking = bookingEvent.booking;
    }

    const ids = [
      ...new Set(
        payload.map((row) => String(row.supply_item_id || "").trim()).filter(Boolean),
      ),
    ];
    const supplyRows = await prisma.supplyItem.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        ...VALID_TYPES_FILTER,
        OR: supplyVisibilityOrBranches(businessId, userId),
      },
      include: { category: true },
    });
    const byId = new Map(supplyRows.map((row) => [row.id, row]));
    if (supplyRows.length !== ids.length) {
      return errorResponse(
        res,
        "One or more supply items not found",
        200,
        "VALIDATION_ERROR",
      );
    }

    const categorySlugsSet = new Set();
    for (const row of payload) {
      const source = byId.get(String(row.supply_item_id || "").trim());
      if (!source) continue;
      categorySlugsSet.add(source.categorySlug);
    }
    const catRows = await prisma.supplyItemCategory.findMany({
      where: { slug: { in: [...categorySlugsSet] }, isActive: true },
    });
    const catBySlug = new Map(catRows.map((c) => [c.slug, c]));
    const categoryLabels = [...categorySlugsSet]
      .sort()
      .map((slug) =>
        catBySlug.has(slug)
          ? resolveLocalizedName(catBySlug.get(slug).name, lang)
          : slug,
      );

    const title = normalizeCustomTitle(body.title);
    if (!title) {
      return errorResponse(res, "List name is required", 200, "VALIDATION_ERROR");
    }
    const categoriesLabel =
      categoryLabels.length <= 1
        ? categoryLabels[0] ?? ""
        : categoryLabels.join(", ");

    const list = await prisma.$transaction(async (tx) => {
      const created = await tx.supplySavedList.create({
        data: {
          businessId,
          createdByUserId: userId ?? null,
          title,
          bookingEventId: bookingEventId || null,
          categoriesLabel,
          items: {
            create: payload.map((row) => {
              const source = byId.get(String(row.supply_item_id || "").trim());
              const qty = normalizeListQty(row.quantity);
              return {
                supplyItemId: source.id,
                quantity: qty,
                unit: String(row.unit || source.defaultUnit || "kg"),
                categorySlug: source.categorySlug,
                nameSnapshot: source.name,
              };
            }),
          },
        },
        include: {
          items: { include: { supplyItem: true } },
        },
      });
      return created;
    });

    const detail = await prisma.supplySavedList.findFirst({
      where: { id: list.id, businessId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        bookingEvent: { select: { functionType: true } },
        booking: { select: { functionType: true } },
      },
    });

    return successResponse(res, "Supply list saved", {
      list: formatSavedListDetail(detail, lang),
    });
  } catch (e) {
    console.error("createSupplySavedList:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * Event-scoped lists take the function type straight off their event; a
 * booking-level combined list (no specific event) falls back to the
 * booking's own functionType, which is kept in sync with the booking's
 * first event at creation time (see bookingController.js) — good enough as
 * a representative value even though the booking may span several events.
 */
function resolveSavedListFunctionType(row, lang) {
  const slug = row.bookingEvent?.functionType ?? row.booking?.functionType ?? null;
  return resolveFunctionTypeLabel(slug, lang);
}

/**
 * First/last event date of the list's order (or its single event), as ISO
 * strings; null for a list not linked to any booking.
 */
function resolveSavedListEventRange(row) {
  const dates = [
    ...(row.booking?.events ?? []).map((e) => e.eventAt),
    row.bookingEvent?.eventAt,
  ]
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  if (dates.length === 0) return { event_start_at: null, event_end_at: null };
  return {
    event_start_at: new Date(Math.min(...dates)).toISOString(),
    event_end_at: new Date(Math.max(...dates)).toISOString(),
  };
}

function formatSavedListSummary(row, lang) {
  return {
    ...resolveSavedListEventRange(row),
    id: row.id,
    title: row.title,
    booking_event_id: row.bookingEventId ?? null,
    booking_id: row.bookingId ?? null,
    item_count: row._count?.items ?? row.items?.length ?? 0,
    categories_label: row.categoriesLabel ?? null,
    function_type: resolveSavedListFunctionType(row, lang),
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function formatSavedListDetail(row, lang) {
  if (!row) return null;
  return {
    ...resolveSavedListEventRange(row),
    id: row.id,
    title: row.title,
    booking_event_id: row.bookingEventId ?? null,
    booking_id: row.bookingId ?? null,
    auto_sync: Boolean(row.autoSync),
    categories_label: row.categoriesLabel ?? null,
    function_type: resolveSavedListFunctionType(row, lang),
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    items: (row.items || []).map((it) => serializeSavedItem(it, lang)),
  };
}

async function listSupplySavedLists(req, res) {
  try {
    const businessId = req.businessId;
    if (!businessId) {
      return errorResponse(res, "Business required", 200, "VALIDATION_ERROR");
    }
    const lang = getRequestedLanguage(req);
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;

    const bookingEventIdFilter = String(
      req.query.booking_event_id ?? "",
    ).trim();
    const search = String(req.query.search ?? "").trim();
    const source = String(req.query.source ?? "all").trim().toLowerCase();

    // Order lists are reconciled with the business's orders before the first
    // page is served (later pages reuse the same state).
    if (page === 1 && source !== "normal" && !bookingEventIdFilter) {
      await reconcileOrderSupplyListsOnce({ businessId, userId: req.user?.userId, language: lang });
    }

    const where = { businessId };
    if (bookingEventIdFilter) {
      where.bookingEventId = bookingEventIdFilter;
    }
    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }
    // "order" = auto-saved from a confirmed booking (bookingId set); "normal"
    // = everything else (manually created lists, event-scoped lists).
    if (source === "order") {
      where.bookingId = { not: null };
    } else if (source === "normal") {
      where.bookingId = null;
    }

    const [total, rows] = await prisma.$transaction([
      prisma.supplySavedList.count({ where }),
      prisma.supplySavedList.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          bookingEventId: true,
          bookingId: true,
          categoriesLabel: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { items: true } },
          bookingEvent: { select: { functionType: true, eventAt: true } },
          booking: { select: { functionType: true, events: { select: { eventAt: true } } } },
        },
      }),
    ]);

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    return successResponse(res, "OK", {
      lists: rows.map((r) => formatSavedListSummary(r, lang)),
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_more: page < totalPages,
      },
    });
  } catch (e) {
    console.error("listSupplySavedLists:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function getSupplySavedList(req, res) {
  try {
    const businessId = req.businessId;
    const lang = getRequestedLanguage(req);
    const id = String(req.params.id || "").trim();
    if (!businessId || !id) {
      return errorResponse(res, "Invalid request", 200, "VALIDATION_ERROR");
    }

    const head = await prisma.supplySavedList.findFirst({
      where: { id, businessId },
      select: { id: true, bookingId: true, autoSync: true, updatedAt: true },
    });
    if (!head) {
      return errorResponse(res, "List not found", 404, "NOT_FOUND");
    }
    if (head.autoSync && head.bookingId) {
      const syncArgs = { list: head, businessId, userId: req.user?.userId, language: lang };
      if (await orderListNeedsSync(head)) {
        await syncOrderSupplyList(syncArgs);
      } else {
        // Nothing on the order changed — serve the saved items now and pick
        // up any recipe edits in the background.
        void syncOrderSupplyList(syncArgs);
      }
    }

    const row = await prisma.supplySavedList.findFirst({
      where: { id, businessId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        bookingEvent: { select: { functionType: true, eventAt: true } },
        booking: { select: { functionType: true, events: { select: { eventAt: true } } } },
      },
    });
    if (!row) {
      return errorResponse(res, "List not found", 404, "NOT_FOUND");
    }

    return successResponse(res, "OK", {
      list: formatSavedListDetail(row, lang),
    });
  } catch (e) {
    console.error("getSupplySavedList:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function updateSupplySavedList(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const lang = getRequestedLanguage(req);
    const id = String(req.params.id || "").trim();
    const body = req.body || {};
    const payload = Array.isArray(body.items) ? body.items : [];

    if (!businessId || !id) {
      return errorResponse(res, "Invalid request", 200, "VALIDATION_ERROR");
    }
    if (payload.length === 0) {
      return errorResponse(res, "At least one item is required", 200, "VALIDATION_ERROR");
    }

    const existing = await prisma.supplySavedList.findFirst({
      where: { id, businessId },
      include: {
        bookingEvent: {
          include: {
            booking: {
              select: {
                id: true,
                businessId: true,
                customerName: true,
              },
            },
          },
        },
      },
    });
    if (!existing) {
      return errorResponse(res, "List not found", 404, "NOT_FOUND");
    }
    if (existing.bookingId) {
      // Order lists mirror their booking; items are edited on the booking's
      // own supply list instead.
      return errorResponse(res, "Order supply lists are edited from the order", 200, "VALIDATION_ERROR");
    }

    let booking = null;
    const bookingEvent = existing.bookingEvent;
    if (
      bookingEvent?.booking &&
      bookingEvent.booking.businessId === businessId
    ) {
      booking = bookingEvent.booking;
    }

    const ids = [
      ...new Set(
        payload.map((row) => String(row.supply_item_id || "").trim()).filter(Boolean),
      ),
    ];
    const supplyRows = await prisma.supplyItem.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        ...VALID_TYPES_FILTER,
        OR: supplyVisibilityOrBranches(businessId, userId),
      },
      include: { category: true },
    });
    const byId = new Map(supplyRows.map((row) => [row.id, row]));
    if (supplyRows.length !== ids.length) {
      return errorResponse(
        res,
        "One or more supply items not found",
        200,
        "VALIDATION_ERROR",
      );
    }

    const categorySlugsSet = new Set();
    for (const row of payload) {
      const source = byId.get(String(row.supply_item_id || "").trim());
      if (!source) continue;
      categorySlugsSet.add(source.categorySlug);
    }
    const catRows = await prisma.supplyItemCategory.findMany({
      where: { slug: { in: [...categorySlugsSet] }, isActive: true },
    });
    const catBySlug = new Map(catRows.map((c) => [c.slug, c]));
    const categoryLabels = [...categorySlugsSet]
      .sort()
      .map((slug) =>
        catBySlug.has(slug)
          ? resolveLocalizedName(catBySlug.get(slug).name, lang)
          : slug,
      );

    const customTitle = normalizeCustomTitle(body.title);
    const title = customTitle ?? existing.title;
    const categoriesLabel =
      categoryLabels.length <= 1
        ? categoryLabels[0] ?? ""
        : categoryLabels.join(", ");

    await prisma.$transaction(async (tx) => {
      await tx.supplySavedListItem.deleteMany({ where: { listId: id } });
      await tx.supplySavedList.update({
        where: { id },
        data: {
          title,
          categoriesLabel,
          items: {
            create: payload.map((row) => {
              const source = byId.get(String(row.supply_item_id || "").trim());
              const qty = normalizeListQty(row.quantity);
              return {
                supplyItemId: source.id,
                quantity: qty,
                unit: String(row.unit || source.defaultUnit || "kg"),
                categorySlug: source.categorySlug,
                nameSnapshot: source.name,
              };
            }),
          },
        },
      });
    });

    const detail = await prisma.supplySavedList.findFirst({
      where: { id, businessId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        bookingEvent: { select: { functionType: true } },
        booking: { select: { functionType: true } },
      },
    });

    return successResponse(res, "Supply list updated", {
      list: formatSavedListDetail(detail, lang),
    });
  } catch (e) {
    console.error("updateSupplySavedList:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

/**
 * Link a saved list to a booking event and copy its lines onto the event
 * (ingredient + utensil rows). Other lists previously linked to this event are unlinked.
 */
async function assignSupplySavedListToBookingEvent(req, res) {
  try {
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const listId = String(req.params.id || "").trim();
    const body = req.body || {};
    const bookingId = String(body.booking_id || "").trim();
    const eventId = String(body.booking_event_id || "").trim();

    if (!businessId || !listId || !bookingId || !eventId) {
      return errorResponse(res, "Invalid request", 200, "VALIDATION_ERROR");
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true, status: true },
    });
    if (!booking) {
      return errorResponse(res, "Booking not found", 404, "NOT_FOUND");
    }
    if (booking.status === "CANCELLED") {
      return errorResponse(
        res,
        "Cancelled booking cannot be updated",
        200,
        "VALIDATION_ERROR",
      );
    }

    const event = await prisma.bookingEvent.findFirst({
      where: { id: eventId, bookingId },
      select: { id: true },
    });
    if (!event) {
      return errorResponse(res, "Event not found", 404, "NOT_FOUND");
    }

    const list = await prisma.supplySavedList.findFirst({
      where: { id: listId, businessId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!list) {
      return errorResponse(res, "List not found", 404, "NOT_FOUND");
    }
    if (!list.items.length) {
      return errorResponse(res, "List has no items", 200, "VALIDATION_ERROR");
    }

    const ids = [...new Set(list.items.map((i) => i.supplyItemId))];
    const supplyRows = await prisma.supplyItem.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        OR: supplyVisibilityOrBranches(businessId, userId),
      },
      include: { category: true },
    });
    const byId = new Map(supplyRows.map((r) => [r.id, r]));
    if (supplyRows.length !== ids.length) {
      return errorResponse(
        res,
        "One or more supply items not found",
        200,
        "VALIDATION_ERROR",
      );
    }

    for (const row of supplyRows) {
      if (row.businessId != null && row.businessId !== businessId) {
        return errorResponse(
          res,
          "One or more supply items not found",
          200,
          "VALIDATION_ERROR",
        );
      }
    }

    const ingredientPayload = [];
    const utensilPayload = [];
    for (const line of list.items) {
      const source = byId.get(line.supplyItemId);
      if (!source) continue;
      const row = {
        supply_item_id: line.supplyItemId,
        quantity: line.quantity,
        unit: String(line.unit || source.defaultUnit || "kg"),
      };
      if (source.type === "UTENSIL") {
        const msg = utensilStockExceededMessage(source, row.quantity);
        if (msg) return errorResponse(res, msg, 200, "VALIDATION_ERROR");
        utensilPayload.push(row);
      } else {
        ingredientPayload.push(row);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.supplySavedList.updateMany({
        where: { businessId, bookingEventId: eventId, id: { not: listId } },
        data: { bookingEventId: null },
      });

      await tx.supplySavedList.update({
        where: { id: listId },
        data: { bookingEventId: eventId },
      });

      for (const itemType of ["INGREDIENT", "UTENSIL"]) {
        const payload =
          itemType === "INGREDIENT" ? ingredientPayload : utensilPayload;
        // Only the event-level list — leave per-dish ingredient overrides
        // (menuItemId set) intact; they layer on top at read time.
        await tx.bookingEventSupplyItem.deleteMany({
          where: { bookingEventId: eventId, itemType, menuItemId: null },
        });
        if (payload.length) {
          await tx.bookingEventSupplyItem.createMany({
            data: payload.map((row) => {
              const source = byId.get(String(row.supply_item_id));
              let qty =
                itemType === "UTENSIL"
                  ? normalizeUtensilQty(row.quantity)
                  : normalizeListQty(row.quantity);
              if (
                itemType === "UTENSIL" &&
                source.availableCount != null &&
                qty > source.availableCount
              ) {
                qty = source.availableCount;
              }
              return {
                bookingEventId: eventId,
                supplyItemId: source.id,
                itemType,
                menuItemId: null,
                quantity: qty,
                unit: String(
                  row.unit || source.defaultUnit || (itemType === "UTENSIL" ? "pcs" : "kg"),
                ),
                categorySlug: source.categorySlug,
                nameSnapshot: source.name,
              };
            }),
          });
        }
      }
    });

    return successResponse(res, "Supply list assigned to event", {
      ok: true,
      list_id: listId,
    });
  } catch (e) {
    console.error("assignSupplySavedListToBookingEvent:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function deleteSupplySavedList(req, res) {
  try {
    const businessId = req.businessId;
    const id = String(req.params.id || "").trim();
    if (!businessId || !id) {
      return errorResponse(res, "Invalid request", 200, "VALIDATION_ERROR");
    }

    const existing = await prisma.supplySavedList.findFirst({
      where: { id, businessId },
      select: { id: true, bookingId: true },
    });
    if (!existing) {
      return errorResponse(res, "List not found", 404, "NOT_FOUND");
    }
    if (existing.bookingId) {
      // Removed automatically with its order (completed, cancelled, past, deleted).
      return errorResponse(res, "Order supply lists are removed with the order", 200, "VALIDATION_ERROR");
    }

    await prisma.supplySavedList.delete({ where: { id } });
    return successResponse(res, "Supply list deleted", { id });
  } catch (e) {
    console.error("deleteSupplySavedList:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

module.exports = {
  createSupplySavedList,
  listSupplySavedLists,
  getSupplySavedList,
  updateSupplySavedList,
  assignSupplySavedListToBookingEvent,
  deleteSupplySavedList,
  autoSaveSupplyListsForConfirmedBooking,
  deleteOrderSupplyListForBooking,
  syncOrderSupplyListForBooking,
};
