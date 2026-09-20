-- Ingredient quantities are changing meaning from "amount for 1 guest/plate"
-- to "amount for 100 guests" (see md/menu.md and supplyController.js's
-- computeEventMenuIngredientData). Existing rows were stored under the old
-- per-1-guest convention, so every numeric `qty` inside MenuItem.ingredients
-- and DishMenuItem.ingredients must be multiplied by 100 to keep producing
-- the same real-world quantities under the new formula.
--
-- Only the `qty` key of each ingredient object is touched; `name`, `unit`,
-- `cost`, and `supply_item_id` are preserved byte-for-byte. Rows where `qty`
-- is missing or not a plain numeric string/number are left untouched rather
-- than causing an error. `qty`'s original JSON type (number vs string) is
-- preserved on write-back. Not idempotent by design — running this twice
-- would double-scale the data, which is why it ships as a tracked Prisma
-- migration (applied at most once via _prisma_migrations) rather than a
-- manually re-runnable script.
--
-- Dish.requiredIngredients is intentionally NOT touched here: it's a
-- separate, explicitly-set absolute override, never derived from the
-- per-guest recipe qty.

UPDATE "MenuItem" m
SET "ingredients" = sub.new_ingredients
FROM (
  SELECT
    m2.id,
    COALESCE(
      jsonb_agg(
        CASE
          WHEN elem ? 'qty'
           AND (elem->>'qty') IS NOT NULL
           AND (elem->>'qty') ~ '^\s*-?\d+(\.\d+)?\s*$'
          THEN jsonb_set(
                 elem,
                 '{qty}',
                 CASE WHEN jsonb_typeof(elem->'qty') = 'number'
                      THEN to_jsonb((elem->>'qty')::numeric * 100)
                      ELSE to_jsonb(((elem->>'qty')::numeric * 100)::text)
                 END,
                 false
               )
          ELSE elem
        END
        ORDER BY ord
      ) FILTER (WHERE elem IS NOT NULL),
      '[]'::jsonb
    ) AS new_ingredients
  FROM "MenuItem" m2
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(m2."ingredients"::jsonb, '[]'::jsonb))
    WITH ORDINALITY AS t(elem, ord) ON true
  GROUP BY m2.id
) sub
WHERE m.id = sub.id
  AND jsonb_typeof(COALESCE(m."ingredients"::jsonb, '[]'::jsonb)) = 'array'
  AND jsonb_array_length(COALESCE(m."ingredients"::jsonb, '[]'::jsonb)) > 0;

UPDATE "DishMenuItem" d
SET "ingredients" = sub.new_ingredients
FROM (
  SELECT
    d2.id,
    COALESCE(
      jsonb_agg(
        CASE
          WHEN elem ? 'qty'
           AND (elem->>'qty') IS NOT NULL
           AND (elem->>'qty') ~ '^\s*-?\d+(\.\d+)?\s*$'
          THEN jsonb_set(
                 elem,
                 '{qty}',
                 CASE WHEN jsonb_typeof(elem->'qty') = 'number'
                      THEN to_jsonb((elem->>'qty')::numeric * 100)
                      ELSE to_jsonb(((elem->>'qty')::numeric * 100)::text)
                 END,
                 false
               )
          ELSE elem
        END
        ORDER BY ord
      ) FILTER (WHERE elem IS NOT NULL),
      '[]'::jsonb
    ) AS new_ingredients
  FROM "DishMenuItem" d2
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(d2."ingredients"::jsonb, '[]'::jsonb))
    WITH ORDINALITY AS t(elem, ord) ON true
  GROUP BY d2.id
) sub
WHERE d.id = sub.id
  AND jsonb_typeof(COALESCE(d."ingredients"::jsonb, '[]'::jsonb)) = 'array'
  AND jsonb_array_length(COALESCE(d."ingredients"::jsonb, '[]'::jsonb)) > 0;
