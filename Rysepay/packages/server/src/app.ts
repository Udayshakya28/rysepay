import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { globalRateLimiter } from "./middleware/rateLimiter.js";
import { healthRouter } from "./modules/health/routes.js";
import { authRouter } from "./modules/auth/routes.js";
import { merchantsRouter } from "./modules/merchants/routes.js";
import { paymentsRouter } from "./modules/payments/routes.js";
import { fxRouter } from "./modules/fx/routes.js";
import { settlementsRouter } from "./modules/settlements/routes.js";
import { webhooksRouter } from "./modules/webhooks/routes.js";
import { openApiSpec } from "./openapi.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors());
  app.use(requestLogger);

  // Webhooks need the RAW body for signature verification — mount BEFORE
  // the JSON body parser, with their own raw parser inside the router.
  app.use("/webhooks", webhooksRouter);

  // From here on, JSON parsing is fine.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  // Health (no rate limit — used by load balancers).
  app.use("/health", healthRouter);

  // Docs.
  app.get("/openapi.json", (_req, res) => res.json(openApiSpec));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  // All other routes go through global rate limit.
  app.use(globalRateLimiter);

  app.use("/auth", authRouter);
  app.use("/v1/merchants", merchantsRouter);
  app.use("/v1/payments", paymentsRouter);
  app.use("/v1/fx", fxRouter);
  app.use("/v1/admin/settlements", settlementsRouter);

  // 404 + error handlers (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
