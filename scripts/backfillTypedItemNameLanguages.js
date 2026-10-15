/**
 * One-time backfill: caterer-created menu and supply items used to store a name typed in
 * Gujarati or Hindi as English (`{ en: "ખમણ" }`), or copied into every language
 * (`{ en: "ખમણ", hi: "ખમણ", gu: "ખમણ" }`). Move such names to the language they are
 * written in (`{ gu: "ખમણ" }`), the same way new names are stored now.
 *
 * Only business/user items whose name has a single distinct value written in Gujarati or
 * Devanagari script are touched; catalog items and names with real translations are left
 * alone. Safe to re-run.
 *
 * Usage: node scripts/backfillTypedItemNameLanguages.js           (dry run, prints changes)
 *        node scripts/backfillTypedItemNameLanguages.js --apply   (writes them)
 */
const prisma = require("../src/config/prisma");
const { detectNameLanguage } = require("../src/utils/localization");

const APPLY = process.argv.includes("--apply");

function fixedName(name) {
  if (!name || typeof name !== "object" || Array.isArray(name)) return null;
  const values = [
    ...new Set(
      Object.values(name)
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean),
    ),
  ];
  if (values.length !== 1) return null;
  const lang = detectNameLanguage(values[0]);
  if (lang === "en") return null;
  const keys = Object.keys(name);
  if (keys.length === 1 && keys[0] === lang) return null;
  return { [lang]: values[0] };
}

async function backfill(label, model) {
  const rows = await model.findMany({
    where: { isGlobal: false, OR: [{ businessId: { not: null } }, { createdByUserId: { not: null } }] },
    select: { id: true, name: true },
  });
  let changed = 0;
  for (const row of rows) {
    const next = fixedName(row.name);
    if (!next) continue;
    changed += 1;
    console.log(`${label} ${row.id}: ${JSON.stringify(row.name)} -> ${JSON.stringify(next)}`);
    if (APPLY) await model.update({ where: { id: row.id }, data: { name: next } });
  }
  console.log(`${label}: ${changed} of ${rows.length} item(s) ${APPLY ? "updated" : "would change"}.`);
}

async function main() {
  await backfill("MenuItem", prisma.menuItem);
  await backfill("SupplyItem", prisma.supplyItem);
  if (!APPLY) console.log("Dry run only. Re-run with --apply to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
