-- Facebook sign-in: stores the app-scoped Facebook user id. Nullable + unique; no existing rows change.
ALTER TABLE "User" ADD COLUMN "facebookId" TEXT;

CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");
