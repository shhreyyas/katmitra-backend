const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");
const {
  computeEventMenuIngredientData,
  canViewMenuItemForSupply,
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

function formatTitleDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(dt);
}

/**
 * Title is deliberately just "<customer name> - <date>" — no categories, no
 * function type. Function type is surfaced as its own `function_type` field
 * on the response instead (see formatSavedListSummary/Detail), same split
 * buildUnsavedBookingTitle in supplyController.js uses for the live/unsaved
 * equivalent of this list.
 * @param {object} opts
 * @param {{ customerName?: string|null }|null} opts.booking
 * @param {Date} [opts.at]
 */
function buildSavedListTitle({ booking, at }) {
  const now = at ?? new Date();
  const dateStr = formatTitleDate(now);
  const customerName = booking?.customerName ? String(booking.customerName).trim() : "";
  return customerName ? `${customerName} - ${dateStr}` : dateStr;
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
  const ids = [...new Set(lines.map((l) => l.supply_item_id).filter(Boolean))];
  if (ids.length === 0) return null;

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
  if (validLines.length === 0) return null;

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

  const title = buildSavedListTitle({ booking, at: new Date() });

  return prisma.supplySavedList.create({
    data: {
      businessId,
      createdByUserId: userId ?? null,
      title,
      bookingEventId,
      bookingId,
      categoriesLabel,
      items: {
        create: validLines.map((line) => {
          const source = byId.get(line.supply_item_id);
          const qty = Math.max(1, Math.min(999, Math.round(Number(line.quantity)) || 1));
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
 * Called right after a booking is confirmed (bookingController.js's
 * confirmBooking) — auto-saves ONE combined supply list for the whole
 * booking (summing every event's ingredients together, same "one grocery
 * run covers the booking" aggregation the Booking Supply List screen
 * already uses via getFullBookingPdfSupplyBreakdown), so it shows up on the
 * main Supply Lists screen without a manual save step. A booking with
 * multiple events gets a single list, not one per event. Prefers each
 * event's already-set per-event rows (the caterer's own reviewed
 * quantities) over the raw menu-derived recipe. Best-effort — failures here
 * must never fail booking confirmation.
 */
async function autoSaveSupplyListsForConfirmedBooking({ businessId, userId, language, booking }) {
  const events = Array.isArray(booking?.events) ? booking.events : [];
  if (events.length === 0) return;

  const existing = await prisma.supplySavedList.findFirst({
    where: { businessId, bookingId: booking.id },
    select: { id: true },
  });
  if (existing) return;

  const eventIds = events.map((e) => e.id);
  const persistedRows = await prisma.bookingEventSupplyItem.findMany({
    where: { bookingEventId: { in: eventIds }, itemType: "INGREDIENT" },
  });
  const persistedByEvent = new Map();
  for (const row of persistedRows) {
    const list = persistedByEvent.get(row.bookingEventId) || [];
    list.push(row);
    persistedByEvent.set(row.bookingEventId, list);
  }

  const menuNeededEvents = events.filter(
    (e) =>
      !persistedByEvent.has(e.id) &&
      Array.isArray(e.eventSnapshot?.menu_items) &&
      e.eventSnapshot.menu_items.length > 0,
  );
  const menuIdSet = new Set();
  for (const e of menuNeededEvents) {
    for (const row of e.eventSnapshot.menu_items) {
      const id = String(row?.id ?? "").trim();
      if (id) menuIdSet.add(id);
    }
  }
  const menus = menuIdSet.size
    ? await prisma.menuItem.findMany({ where: { id: { in: [...menuIdSet] } } })
    : [];
  const visibleMenus = menus.filter((m) => canViewMenuItemForSupply(m, businessId, userId));
  const menuById = new Map(visibleMenus.map((m) => [m.id, m]));

  // supplyItemId -> { quantity, unit } — summed across every event.
  const combined = new Map();
  const addToCombined = (supplyItemId, quantity, unit) => {
    const prev = combined.get(supplyItemId);
    combined.set(supplyItemId, { quantity: (prev?.quantity ?? 0) + quantity, unit: prev?.unit ?? unit });
  };
  for (const event of events) {
    const persisted = persistedByEvent.get(event.id);
    if (persisted && persisted.length > 0) {
      for (const row of persisted) {
        addToCombined(row.supplyItemId, Number(row.quantity) || 0, row.unit);
      }
    } else if (Array.isArray(event.eventSnapshot?.menu_items) && event.eventSnapshot.menu_items.length > 0) {
      const guests = Math.max(0, Number(event.guestCount) || 0);
      const guestMul = guests > 0 ? guests : 1;
      const { buckets } = computeEventMenuIngredientData(
        event.eventSnapshot.menu_items,
        guestMul,
        menuById,
        language,
      );
      for (const [key, qty] of buckets.entries()) {
        const [supplyItemId, unit] = key.split("\t");
        addToCombined(supplyItemId, qty, unit);
      }
    }
  }
  if (combined.size === 0) return;

  const lines = [...combined.entries()].map(([supply_item_id, v]) => ({
    supply_item_id,
    quantity: v.quantity,
    unit: v.unit,
  }));

  try {
    await persistAutoSupplyList({
      businessId,
      userId,
      language,
      bookingId: booking.id,
      booking: { customerName: booking.customerName },
      lines,
    });
  } catch (err) {
    console.warn(
      `autoSaveSupplyListsForConfirmedBooking: failed for booking ${booking.id}:`,
      err.message,
    );
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
              let qty = Math.max(
                1,
                Math.min(999, parseInt(String(row.quantity), 10) || 1),
              );
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

function formatSavedListSummary(row, lang) {
  return {
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
    id: row.id,
    title: row.title,
    booking_event_id: row.bookingEventId ?? null,
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
          bookingEvent: { select: { functionType: true } },
          booking: { select: { functionType: true } },
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

    const row = await prisma.supplySavedList.findFirst({
      where: { id, businessId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        bookingEvent: { select: { functionType: true } },
        booking: { select: { functionType: true } },
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
              let qty = Math.max(
                1,
                Math.min(999, parseInt(String(row.quantity), 10) || 1),
              );
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
              let qty = Math.max(
                1,
                Math.min(999, parseInt(String(row.quantity), 10) || 1),
              );
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
      select: { id: true },
    });
    if (!existing) {
      return errorResponse(res, "List not found", 404, "NOT_FOUND");
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
};
