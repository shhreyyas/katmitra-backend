ALTER TABLE "ContactMessage" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "ContactMessage" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "ContactMessage_status_idx" ON "ContactMessage"("status");
