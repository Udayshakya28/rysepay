import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { withIdempotency } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as controller from "./controller.js";

const router: Router = Router();

router.post(
  "/intents",
  requireAuth,
  requireRole("merchant", "admin"),
  withIdempotency({ scope: "payment_intent.create" }),
  asyncHandler(controller.create),
);

router.get(
  "/intents/:id",
  requireAuth,
  requireRole("merchant", "admin"),
  asyncHandler(controller.get),
);

router.post(
  "/:id/refund",
  requireAuth,
  requireRole("merchant", "admin"),
  withIdempotency({ scope: "payment_intent.refund" }),
  asyncHandler(controller.refund),
);

export { router as paymentsRouter };
