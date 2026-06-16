-- CreateTable: per-user notification inbox
CREATE TABLE "UserNotification" (
    "id"        TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "title"     TEXT        NOT NULL,
    "body"      TEXT        NOT NULL,
    "type"      TEXT        NOT NULL,
    "data"      JSONB,
    "isRead"    BOOLEAN     NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- Composite index for fetching a user's feed in descending order
CREATE INDEX "UserNotification_userId_createdAt_idx"
    ON "UserNotification"("userId", "createdAt" DESC);

-- Index for the unread-count query (WHERE userId = ? AND isRead = false)
CREATE INDEX "UserNotification_userId_isRead_idx"
    ON "UserNotification"("userId", "isRead");

-- Foreign key: deleting a User cascades to their notification inbox
ALTER TABLE "UserNotification"
    ADD CONSTRAINT "UserNotification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
