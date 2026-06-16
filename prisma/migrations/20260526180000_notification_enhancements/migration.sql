-- Add priority to NotificationLog for future admin segmentation/urgency
ALTER TABLE "NotificationLog"
    ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal';

-- Add readAt to UserNotification to track when the user dismissed the notification
ALTER TABLE "UserNotification"
    ADD COLUMN "readAt" TIMESTAMP(3);
