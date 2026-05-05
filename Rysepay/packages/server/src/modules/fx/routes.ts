import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as controller from "./controller.js";

const router: Router = Router();

router.get("/rates", asyncHandler(controller.getRate));
router.post("/quotes", asyncHandler(controller.createQuote));

export { router as fxRouter };
