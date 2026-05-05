import type { Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors.js";
import { prisma } from "../../db/prisma.js";
import * as settlementsService from "./service.js";

export async function listMine(req: Request, res: Response) {
  if (!req.auth) throw new UnauthorizedError();
  const merchant = await prisma.merchant.findFirst({ where: { userId: req.auth.sub } });
  if (!merchant) throw new ForbiddenError("not a merchant");
  const settlements = await settlementsService.listForMerchant(merchant.id);
  res.json({ settlements });
}

export async function runBatch(req: Request, res: Response) {
  // Admin-only — used in dev to manually trigger settlement.
  if (!req.auth) throw new UnauthorizedError();
  if (req.auth.userType !== "admin") throw new ForbiddenError("admin only");
  const result = await settlementsService.runSettlementBatch();
  res.json(result);
}
