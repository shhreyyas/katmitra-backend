-- Add an explicit ordering column for menu items within a dish.
-- Backfills existing rows from their current createdAt order so saved dishes
-- keep the order they currently display.

ALTER TABLE "DishMenuItem" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "dishId" ORDER BY "createdAt", "id") - 1 AS rn
  FROM "DishMenuItem"
)
UPDATE "DishMenuItem" AS d
SET "position" = o.rn
FROM ordered AS o
WHERE d."id" = o."id";
