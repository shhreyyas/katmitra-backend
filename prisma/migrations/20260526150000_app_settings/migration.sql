CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "appName" TEXT NOT NULL DEFAULT 'Katmitra',
    "supportEmail" TEXT NOT NULL DEFAULT 'support@katmitra.com',
    "paymentUpi" TEXT NOT NULL DEFAULT '',
    "paymentBank" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AppSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
