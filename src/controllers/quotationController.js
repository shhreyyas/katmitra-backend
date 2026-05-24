const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { successResponse, errorResponse } = require("../utils/response");
const { getRequestedLanguage, resolveLocalizedName } = require("../utils/localization");

function deriveIsGlobal(businessId, createdByUserId) {
  if (businessId == null || businessId === "") return true;
  if (createdByUserId == null || createdByUserId === "") return true;
  return false;
}

function canViewMenuItem(menu, contextBusinessId, userId) {
  if (menu.createdByUserId === userId) {
    return true;
  }
  if (menu.businessId != null && menu.businessId !== contextBusinessId) {
    return false;
  }
  if (menu.businessId == null) {
    return menu.isGlobal === true;
  }
  return deriveIsGlobal(menu.businessId, menu.createdByUserId);
}

function num(d) {
  if (d == null) return 0;
  const n = typeof d === "number" ? d : Number(d);
  return Number.isFinite(n) ? n : 0;
}

/** @returns {number | null | undefined} undefined = omit patch; null = clear column */
function parsePlatePrice(body) {
  const raw = body.plate_price ?? body.platePrice;
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** @param {unknown} bodyStatus @param {"DRAFT"|"SALE"|"SENT"|"ACCEPTED"} [fallback] */
function parseQuotationStatus(bodyStatus, fallback = "SALE") {
  const raw = String(bodyStatus ?? fallback).toUpperCase();
  if (raw === "DRAFT") return "DRAFT";
  if (raw === "SALE") return "SALE";
  if (raw === "ACCEPTED") return "ACCEPTED";
  if (raw === "SENT") return "SENT";
  return fallback;
}

function computeQuotationPricing(rows, guestCount, discount, servicePct, taxPct) {
  const guests = Math.max(0, Math.floor(Number(guestCount) || 0));
  const perPlateTotal = rows.reduce((s, r) => s + num(r.pricePerPlateSnapshot), 0);
  const subtotal = perPlateTotal * guests;
  const serviceChargeAmount = subtotal * (servicePct / 100);
  const taxAmount = subtotal * (taxPct / 100);
  const disc = Math.max(0, num(discount));
  const total = Math.max(0, subtotal + serviceChargeAmount + taxAmount - disc);
  return { subtotal, serviceChargeAmount, taxAmount, total };
}

/**
 * Build quotation menu snapshot rows from optional `body.menu_items`, else catalog prices.
 * @returns {{ rows: { menuItemId: string, pricePerPlateSnapshot: number, nameSnapshot: string }[] } | { error: string }}
 */
function buildSnapRowsFromMenuItemsOrCatalog(body, menus, requestedLanguage) {
  const custom = Array.isArray(body.menu_items) ? body.menu_items : [];
  if (custom.length === 0) {
    return {
      rows: menus.map((m) => ({
        menuItemId: m.id,
        pricePerPlateSnapshot: num(m.pricePerPerson),
        nameSnapshot: resolveLocalizedName(m.name, requestedLanguage),
      })),
    };
  }
  if (custom.length !== menus.length) {
    return { error: "menu_items must have the same length as menu_item_ids" };
  }
  const byId = new Map(custom.map((x) => [String(x.menu_item_id), x]));
  for (const m of menus) {
    if (!byId.has(m.id)) {
      return { error: "menu_items must include every menu_item_id" };
    }
  }
  const rows = menus.map((m) => {
    const row = byId.get(m.id);
    const snap = num(
      row.price_per_plate_snapshot ??
        row.price_per_plate ??
        row.pricePerPlateSnapshot ??
        row.pricePerPlate,
    );
    const nameSnap =
      row.name_snapshot != null && String(row.name_snapshot).trim() !== ""
        ? String(row.name_snapshot).trim()
        : resolveLocalizedName(m.name, requestedLanguage);
    return { menuItemId: m.id, pricePerPlateSnapshot: snap, nameSnapshot: nameSnap };
  });
  return { rows };
}

function serializeQuotation(q) {
  return {
    id: q.id,
    business_id: q.businessId,
    status: q.status ?? "SALE",
    client_name: q.clientName,
    client_phone: q.clientPhone ?? null,
    function_type: q.functionType ?? null,
    event_date: q.eventDate?.toISOString?.() ?? q.eventDate,
    guest_count: q.guestCount,
    discount_amount: num(q.discountAmount),
    service_charge_pct: num(q.serviceChargePct),
    tax_pct: num(q.taxPct),
    subtotal: num(q.subtotal),
    service_charge_amount: num(q.serviceChargeAmount),
    tax_amount: num(q.taxAmount),
    total: num(q.total),
    plate_price: q.platePrice != null ? num(q.platePrice) : null,
    menu_items: (q.menuItems || []).map((mi) => ({
      id: mi.id,
      menu_item_id: mi.menuItemId,
      price_per_plate_snapshot: num(mi.pricePerPlateSnapshot),
      name_snapshot: mi.nameSnapshot,
    })),
    created_at: q.createdAt?.toISOString?.() ?? q.createdAt,
    updated_at: q.updatedAt?.toISOString?.() ?? q.updatedAt,
  };
}

async function createQuotation(req, res) {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const body = req.body || {};

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { defaultServiceChargePct: true, defaultTaxPct: true },
    });
    if (!business) {
      return errorResponse(res, "Business not found", 404, "NOT_FOUND");
    }

    const menuItemIds = Array.isArray(body.menu_item_ids) ? body.menu_item_ids : [];
    const ids = [...new Set(menuItemIds.map((x) => String(x)))];
    const menus = await prisma.menuItem.findMany({ where: { id: { in: ids } } });
    if (menus.length !== ids.length) {
      return errorResponse(res, "One or more menu items not found", 422, "VALIDATION_ERROR");
    }
    for (const m of menus) {
      if (!canViewMenuItem(m, businessId, userId)) {
        return errorResponse(res, "Forbidden menu item in selection", 403, "FORBIDDEN");
      }
    }

    const sc = num(body.service_charge_pct ?? business.defaultServiceChargePct);
    const txp = num(body.tax_pct ?? business.defaultTaxPct);
    const guests = parseInt(body.guest_count, 10) || 0;
    const discount = num(body.discount_amount ?? 0);

    const snapBuilt = buildSnapRowsFromMenuItemsOrCatalog(body, menus, requestedLanguage);
    if (snapBuilt.error) {
      return errorResponse(res, snapBuilt.error, 422, "VALIDATION_ERROR");
    }
    const snapRowsForPricing = snapBuilt.rows.map((r) => ({
      pricePerPlateSnapshot: r.pricePerPlateSnapshot,
    }));
    const pricing = computeQuotationPricing(snapRowsForPricing, guests, discount, sc, txp);
    const status = parseQuotationStatus(body.status, "SALE");
    const platePriceVal = parsePlatePrice(body);
    const platePriceDecimal =
      platePriceVal == null ? null : new Prisma.Decimal(String(platePriceVal));

    const q = await prisma.$transaction(async (tx) => {
      const created = await tx.quotation.create({
        data: {
          businessId,
          status,
          platePrice: platePriceDecimal,
          clientName: String(body.client_name ?? ""),
          clientPhone:
            body.client_phone != null && String(body.client_phone).trim() !== ""
              ? String(body.client_phone).trim()
              : null,
          functionType:
            body.function_type != null && String(body.function_type).trim() !== ""
              ? String(body.function_type).trim()
              : null,
          eventDate: body.event_date ? new Date(body.event_date) : null,
          guestCount: guests,
          discountAmount: new Prisma.Decimal(String(discount)),
          serviceChargePct: new Prisma.Decimal(String(sc)),
          taxPct: new Prisma.Decimal(String(txp)),
          subtotal: new Prisma.Decimal(String(pricing.subtotal)),
          serviceChargeAmount: new Prisma.Decimal(String(pricing.serviceChargeAmount)),
          taxAmount: new Prisma.Decimal(String(pricing.taxAmount)),
          total: new Prisma.Decimal(String(pricing.total)),
        },
      });

      const rows = snapBuilt.rows.map((r) => ({
        quotationId: created.id,
        menuItemId: r.menuItemId,
        pricePerPlateSnapshot: r.pricePerPlateSnapshot,
        nameSnapshot: r.nameSnapshot,
      }));
      if (rows.length) {
        await tx.quotationMenuItem.createMany({ data: rows });
      }

      return tx.quotation.findUnique({
        where: { id: created.id },
        include: { menuItems: true },
      });
    });

    return successResponse(res, "Quotation created", serializeQuotation(q));
  } catch (e) {
    console.error("createQuotation:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function listQuotations(req, res) {
  try {
    const businessId = req.businessId;
    const take = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const skip = parseInt(req.query.offset, 10) || 0;

    const [rows, total] = await Promise.all([
      prisma.quotation.findMany({
        where: { businessId },
        orderBy: { updatedAt: "desc" },
        take,
        skip,
        include: { menuItems: true },
      }),
      prisma.quotation.count({ where: { businessId } }),
    ]);

    return successResponse(res, "OK", {
      quotations: rows.map(serializeQuotation),
      total,
    });
  } catch (e) {
    console.error("listQuotations:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function getQuotation(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;
    const row = await prisma.quotation.findFirst({
      where: { id, businessId },
      include: { menuItems: true },
    });
    if (!row) {
      return errorResponse(res, "Quotation not found", 404, "NOT_FOUND");
    }
    return successResponse(res, "OK", serializeQuotation(row));
  } catch (e) {
    console.error("getQuotation:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function updateQuotation(req, res) {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const businessId = req.businessId;
    const userId = req.user?.userId;
    const id = req.params.id;
    const body = req.body || {};

    const existing = await prisma.quotation.findFirst({
      where: { id, businessId },
      include: { menuItems: true },
    });
    if (!existing) {
      return errorResponse(res, "Quotation not found", 404, "NOT_FOUND");
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { defaultServiceChargePct: true, defaultTaxPct: true },
    });

    let menus = [];
    if (Array.isArray(body.menu_item_ids)) {
      const menuItemIds = [...new Set(body.menu_item_ids.map((x) => String(x)))];
      menus = await prisma.menuItem.findMany({ where: { id: { in: menuItemIds } } });
      if (menus.length !== menuItemIds.length) {
        return errorResponse(res, "One or more menu items not found", 422, "VALIDATION_ERROR");
      }
      for (const m of menus) {
        if (!canViewMenuItem(m, businessId, userId)) {
          return errorResponse(res, "Forbidden menu item in selection", 403, "FORBIDDEN");
        }
      }
    }

    const guests =
      body.guest_count != null ? parseInt(body.guest_count, 10) : existing.guestCount;
    const discount = body.discount_amount != null ? num(body.discount_amount) : num(existing.discountAmount);
    const sc =
      body.service_charge_pct != null ? num(body.service_charge_pct) : num(existing.serviceChargePct);
    const txp = body.tax_pct != null ? num(body.tax_pct) : num(existing.taxPct);

    let snapRows;
    let snapBuiltForTx = null;
    if (menus.length) {
      const snapBuilt = buildSnapRowsFromMenuItemsOrCatalog(body, menus, requestedLanguage);
      if (snapBuilt.error) {
        return errorResponse(res, snapBuilt.error, 422, "VALIDATION_ERROR");
      }
      snapBuiltForTx = snapBuilt;
      snapRows = snapBuilt.rows.map((r) => ({ pricePerPlateSnapshot: r.pricePerPlateSnapshot }));
    } else {
      snapRows = existing.menuItems.map((mi) => ({
        pricePerPlateSnapshot: mi.pricePerPlateSnapshot,
      }));
    }
    const pricing = computeQuotationPricing(snapRows, guests, discount, sc, txp);

    const platePricePatch = parsePlatePrice(body);

    const updated = await prisma.$transaction(async (tx) => {
      if (menus.length && snapBuiltForTx) {
        await tx.quotationMenuItem.deleteMany({ where: { quotationId: id } });
        const rows = snapBuiltForTx.rows.map((r) => ({
          quotationId: id,
          menuItemId: r.menuItemId,
          pricePerPlateSnapshot: r.pricePerPlateSnapshot,
          nameSnapshot: r.nameSnapshot,
        }));
        if (rows.length) await tx.quotationMenuItem.createMany({ data: rows });
      }

      return tx.quotation.update({
        where: { id },
        data: {
          ...(platePricePatch !== undefined
            ? {
                platePrice:
                  platePricePatch === null
                    ? null
                    : new Prisma.Decimal(String(platePricePatch)),
              }
            : {}),
          ...(body.status !== undefined
            ? { status: parseQuotationStatus(body.status, existing.status) }
            : {}),
          clientName: body.client_name !== undefined ? String(body.client_name) : existing.clientName,
          clientPhone:
            body.client_phone !== undefined
              ? body.client_phone != null && String(body.client_phone).trim() !== ""
                ? String(body.client_phone).trim()
                : null
              : existing.clientPhone,
          functionType:
            body.function_type !== undefined
              ? body.function_type != null && String(body.function_type).trim() !== ""
                ? String(body.function_type).trim()
                : null
              : existing.functionType,
          eventDate:
            body.event_date !== undefined
              ? body.event_date
                ? new Date(body.event_date)
                : null
              : existing.eventDate,
          guestCount: guests,
          discountAmount: new Prisma.Decimal(String(discount)),
          serviceChargePct: new Prisma.Decimal(String(sc)),
          taxPct: new Prisma.Decimal(String(txp)),
          subtotal: new Prisma.Decimal(String(pricing.subtotal)),
          serviceChargeAmount: new Prisma.Decimal(String(pricing.serviceChargeAmount)),
          taxAmount: new Prisma.Decimal(String(pricing.taxAmount)),
          total: new Prisma.Decimal(String(pricing.total)),
        },
        include: { menuItems: true },
      });
    });

    return successResponse(res, "Quotation updated", serializeQuotation(updated));
  } catch (e) {
    console.error("updateQuotation:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

async function deleteQuotation(req, res) {
  try {
    const businessId = req.businessId;
    const id = req.params.id;

    const existing = await prisma.quotation.findFirst({ where: { id, businessId } });
    if (!existing) {
      return errorResponse(res, "Quotation not found", 404, "NOT_FOUND");
    }

    await prisma.quotation.delete({ where: { id } });
    return successResponse(res, "Quotation deleted", { id });
  } catch (e) {
    console.error("deleteQuotation:", e);
    return errorResponse(res, "Server error", 500, "SERVER_ERROR", e.message);
  }
}

module.exports = {
  createQuotation,
  listQuotations,
  getQuotation,
  updateQuotation,
  deleteQuotation,
  serializeQuotation,
};
