import { Router } from "express";
import { authRateLimiter } from "../../middleware/rateLimiter.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as controller from "./controller.js";

const router: Router = Router();

router.post("/register", authRateLimiter, asyncHandler(controller.register));
router.post("/login", authRateLimiter, asyncHandler(controller.login));
router.post("/refresh", authRateLimiter, asyncHandler(controller.refresh));
router.post("/logout", asyncHandler(controller.logout));

export { router as authRouter };
