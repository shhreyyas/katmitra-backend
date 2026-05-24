-- AlterTable
ALTER TABLE "Dish" ADD COLUMN "requiredIngredients" JSONB NOT NULL DEFAULT '[]';
