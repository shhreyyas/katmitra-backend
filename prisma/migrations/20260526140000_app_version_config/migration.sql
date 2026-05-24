CREATE TABLE "AppVersionConfig" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "latestVersion" TEXT NOT NULL,
    "minimumVersion" TEXT NOT NULL,
    "updateMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppVersionConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppVersionConfig_platform_key" ON "AppVersionConfig"("platform");
