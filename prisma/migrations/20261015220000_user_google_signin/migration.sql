-- Google sign-in: Google-only users have no password, so passwordHash becomes nullable.
-- Adds googleId (unique) and authProvider; existing rows keep their hash and default to 'email'.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN "authProvider" TEXT NOT NULL DEFAULT 'email';

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
