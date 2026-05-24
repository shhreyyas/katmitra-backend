CREATE TABLE "AccessCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "planType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unused',
    "assignedUserId" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessCode_code_key" ON "AccessCode"("code");
CREATE INDEX "AccessCode_status_idx" ON "AccessCode"("status");
CREATE INDEX "AccessCode_planType_idx" ON "AccessCode"("planType");
CREATE INDEX "AccessCode_assignedUserId_idx" ON "AccessCode"("assignedUserId");

ALTER TABLE "AccessCode" ADD CONSTRAINT "AccessCode_assignedUserId_fkey"
    FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
