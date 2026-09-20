const KITCHEN_TYPES = new Set(["labor", "contract"]);

/** Returns "labor"|"contract"|null (unset), or undefined when the input doesn't match either. */
function normalizeKitchenType(v) {
  if (v === undefined || v === null || v === "") return null;
  const norm = String(v).trim().toLowerCase();
  return KITCHEN_TYPES.has(norm) ? norm : undefined;
}

module.exports = { KITCHEN_TYPES, normalizeKitchenType };
