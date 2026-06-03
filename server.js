const app = require("./src/app");
const prisma = require("./src/config/prisma");
const { startEventReminderCron } = require("./src/services/eventReminderCron");

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startEventReminderCron();
});

async function shutdown(signal) {
  console.log(`${signal} received — closing server and DB connections`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (e) {
      console.error("Prisma disconnect error:", e.message);
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));