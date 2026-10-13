const prisma = require("../config/prisma");

/**
 * Catalogue utensils are shared rows, so each business keeps its own stock for
 * them in BusinessUtensilStock. Utensils a business created itself keep their
 * counts on the SupplyItem row.
 */

/** Prisma codes for "table / column does not exist" (migration not applied yet). */
const MISSING_TABLE_CODES = new Set(["P2021", "P2022"]);

function isSharedUtensil(row) {
  return row?.type === "UTENSIL" && (row.isGlobal === true || row.businessId == null);
}

/** False until the BusinessUtensilStock migration is applied and the client regenerated. */
function stockModelAvailable() {
  return Boolean(prisma.businessUtensilStock);
}

async function loadBusinessUtensilStockMap(businessId) {
  const map = new Map();
  if (!businessId || !stockModelAvailable()) return map;
  try {
    const rows = await prisma.businessUtensilStock.findMany({
      where: { businessId },
      select: { supplyItemId: true, availableCount: true, damagedCount: true },
    });
    for (const row of rows) map.set(row.supplyItemId, row);
  } catch (e) {
    if (!MISSING_TABLE_CODES.has(e?.code)) throw e;
  }
  return map;
}

/**
 * Replaces the stock fields of shared utensils with this business's own counts
 * (no stock recorded => untracked), so every stock check and serializer keeps
 * reading `availableCount` / `damagedCount` as before. Mutates and returns `rows`.
 */
function applyBusinessUtensilStock(rows, stockMap) {
  for (const row of rows) {
    if (!isSharedUtensil(row)) continue;
    const stock = stockMap.get(row.id);
    row.availableCount = stock?.availableCount ?? null;
    row.damagedCount = stock?.damagedCount ?? 0;
  }
  return rows;
}

async function overlayBusinessUtensilStock(rows, businessId) {
  if (!rows.some(isSharedUtensil)) return rows;
  return applyBusinessUtensilStock(rows, await loadBusinessUtensilStockMap(businessId));
}

async function saveBusinessUtensilStock(businessId, supplyItemId, { availableCount, damagedCount }) {
  return prisma.businessUtensilStock.upsert({
    where: { businessId_supplyItemId: { businessId, supplyItemId } },
    create: { businessId, supplyItemId, availableCount, damagedCount },
    update: { availableCount, damagedCount },
  });
}

module.exports = {
  isSharedUtensil,
  stockModelAvailable,
  loadBusinessUtensilStockMap,
  applyBusinessUtensilStock,
  overlayBusinessUtensilStock,
  saveBusinessUtensilStock,
  MISSING_TABLE_CODES,
};
