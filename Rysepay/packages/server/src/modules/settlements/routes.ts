import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as controller from "./controller.js";

const router: Router = Router();

router.get("/", requireAuth, asyncHandler(controller.listMine));
router.post("/run-batch", requireAuth, asyncHandler(controller.runBatch));

export { router as settlementsRouter };
