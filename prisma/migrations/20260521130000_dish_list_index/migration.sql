-- CreateIndex
CREATE INDEX "Dish_businessId_isTemplate_updatedAt_idx" ON "Dish"("businessId", "isTemplate", "updatedAt" DESC);
