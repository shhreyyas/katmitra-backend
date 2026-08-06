-- AlterTable
ALTER TABLE "DishMenuItem" ADD COLUMN "ingredients" JSONB NOT NULL DEFAULT '[]';
