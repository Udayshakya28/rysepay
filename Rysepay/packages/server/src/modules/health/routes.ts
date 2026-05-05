import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { redis } from "../../db/redis.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router: Router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [db, cache] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);

    const dbOk = db.status === "fulfilled";
    const redisOk = cache.status === "fulfilled" && cache.value === "PONG";
    const healthy = dbOk && redisOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      db: dbOk ? "connected" : "disconnected",
      redis: redisOk ? "connected" : "disconnected",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }),
);

export { router as healthRouter };
