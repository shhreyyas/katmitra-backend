const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Paging is opt-in: a list endpoint pages only when the request carries `page`.
 * Without it the endpoint keeps returning its full list, which the admin
 * dropdowns and pickers rely on.
 */
function parsePaging(query) {
  if (query.page === undefined || query.page === "") return null;
  const page = Math.max(1, parseInt(String(query.page), 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(String(query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  return { page, limit, skip: (page - 1) * limit };
}

function paginationMeta(paging, total) {
  return {
    page: paging.page,
    limit: paging.limit,
    total,
    total_pages: Math.ceil(total / paging.limit),
  };
}

/**
 * One page of `model` rows plus the total.
 *
 * `matches` is for searches Prisma can't express on these tables (substring
 * match inside the localized-name JSON). When given, the ids of every row
 * passing `where` are loaded with only `matchSelect` fields, filtered in
 * memory, and just the requested page is then loaded in full — so the search
 * covers the whole table rather than the first N rows.
 */
async function findPage(model, { where, orderBy, include, paging, matches, matchSelect }) {
  if (!matches) {
    const [total, rows] = await Promise.all([
      model.count({ where }),
      model.findMany({ where, orderBy, include, skip: paging.skip, take: paging.limit }),
    ]);
    return { rows, pagination: paginationMeta(paging, total) };
  }

  const light = await model.findMany({
    where,
    orderBy,
    select: { id: true, ...matchSelect },
  });
  const ids = light.filter(matches).map((r) => r.id);
  const pageIds = ids.slice(paging.skip, paging.skip + paging.limit);
  const found = pageIds.length
    ? await model.findMany({ where: { id: { in: pageIds } }, include })
    : [];
  const byId = new Map(found.map((r) => [r.id, r]));
  return {
    rows: pageIds.map((id) => byId.get(id)).filter(Boolean),
    pagination: paginationMeta(paging, ids.length),
  };
}

/** Case-insensitive substring match over a `{ en, hi, gu }` name plus any extra string fields. */
function localizedNameMatcher(search, extraFields = []) {
  const s = search.toLowerCase();
  return (row) =>
    ["en", "hi", "gu"].some((lang) => String(row.name?.[lang] ?? "").toLowerCase().includes(s)) ||
    extraFields.some((f) => String(row[f] ?? "").toLowerCase().includes(s));
}

module.exports = { parsePaging, paginationMeta, findPage, localizedNameMatcher };
