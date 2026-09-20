// Mirrors katmitra-app's src/utils/eventOrder.ts — kept in sync manually.
const MEAL_ORDER = ["breakfast", "lunch", "dinner"];
const MEAL_LEGACY_MAP = { morningbreakfast: "breakfast", eveningnasto: "breakfast" };

function normalizeMealSlug(v) {
  if (!v || typeof v !== "string") return null;
  const norm = v.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (MEAL_LEGACY_MAP[norm]) return MEAL_LEGACY_MAP[norm];
  return MEAL_ORDER.includes(norm) ? norm : null;
}

function mealRank(jamanvarType) {
  const slug = normalizeMealSlug(jamanvarType);
  if (!slug) return MEAL_ORDER.length;
  const idx = MEAL_ORDER.indexOf(slug);
  return idx === -1 ? MEAL_ORDER.length : idx;
}

function startOfDayMs(value) {
  if (!value) return Infinity;
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return Infinity;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
}

function timeMs(value) {
  if (!value) return Infinity;
  const dt = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dt.getTime()) ? Infinity : dt.getTime();
}

/**
 * Orders a booking's events by calendar day first (a multi-day booking's
 * days stay in date order), then by meal time within the same day
 * (breakfast -> lunch -> dinner -> unset), then by original time-of-day as a
 * final tiebreak. Meal type never overrides which day an event falls on —
 * e.g. a Day-1 Dinner still sorts before a Day-2 Breakfast. Expects
 * `{ eventAt, jamanvarType }`-shaped objects (works on raw Prisma rows via
 * `{eventAt, jamanvarType}` or serialized rows via `{event_at, jamanvar_type}`
 * — pass whichever fields are available).
 */
function compareEventsByMealTime(a, b) {
  const aAt = a.eventAt ?? a.event_at ?? null;
  const bAt = b.eventAt ?? b.event_at ?? null;
  const dayDiff = startOfDayMs(aAt) - startOfDayMs(bAt);
  if (dayDiff !== 0) return dayDiff;
  const aMeal = a.jamanvarType ?? a.jamanvar_type ?? null;
  const bMeal = b.jamanvarType ?? b.jamanvar_type ?? null;
  const mealDiff = mealRank(aMeal) - mealRank(bMeal);
  if (mealDiff !== 0) return mealDiff;
  return timeMs(aAt) - timeMs(bAt);
}

function sortEventsByMealTime(events) {
  return [...events].sort(compareEventsByMealTime);
}

module.exports = { compareEventsByMealTime, sortEventsByMealTime };
