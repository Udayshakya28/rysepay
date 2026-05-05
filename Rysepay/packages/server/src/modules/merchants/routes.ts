import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as controller from "./controller.js";

const router: Router = Router();

router.post("/register", requireAuth, asyncHandler(controller.register));
router.get("/me", requireAuth, asyncHandler(controller.me));
router.get("/settlements", requireAuth, asyncHandler(controller.listSettlements));
router.get("/transactions", requireAuth, asyncHandler(controller.listTransactions));

export { router as merchantsRouter };
