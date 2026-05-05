import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { prisma } from "./db/prisma.js";
import { redis } from "./db/redis.js";
import { logger } from "./utils/logger.js";

async function main() {
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      `Ryse Payments server listening on http://localhost:${config.PORT}`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutdown signal received");
    server.close(() => logger.info("http server closed"));
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "fatal startup error");
  process.exit(1);
});
