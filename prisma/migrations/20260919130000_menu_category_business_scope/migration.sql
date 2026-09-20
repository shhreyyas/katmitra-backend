-- AlterTable
ALTER TABLE "MenuCategory" ADD COLUMN     "businessId" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "isGlobal" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "MenuCategory_businessId_idx" ON "MenuCategory"("businessId");

-- CreateIndex
CREATE INDEX "MenuCategory_createdByUserId_idx" ON "MenuCategory"("createdByUserId");

-- CreateIndex
CREATE INDEX "MenuCategory_isGlobal_idx" ON "MenuCategory"("isGlobal");

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
