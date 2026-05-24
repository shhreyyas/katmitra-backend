-- Track dish-level ingredient overrides separately from default empty JSON `[]`
ALTER TABLE "Dish" ADD COLUMN "requiredIngredientsCustomized" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any non-empty saved JSON (plain array or legacy wrapper)
UPDATE "Dish"
SET "requiredIngredientsCustomized" = true
WHERE "requiredIngredients" IS NOT NULL
  AND "requiredIngredients"::text NOT IN ('[]', 'null');
