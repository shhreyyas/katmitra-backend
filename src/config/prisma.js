const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

/** Single Prisma instance (avoids connection pool exhaustion on hot reload). */
const prisma =
  globalForPrisma.__kmPrismaClient ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" &&
      process.env.PRISMA_LOG === "1"
        ? ["error", "warn"]
        : [],
  });

globalForPrisma.__kmPrismaClient = prisma;

module.exports = prisma;
