import type { Request, Response } from "express";
import { z } from "zod";
import { IDEMPOTENCY_HEADER } from "@ryse/shared/constants";
import { UnauthorizedError, ValidationError, ForbiddenError } from "../../utils/errors.js";
import { prisma } from "../../db/prisma.js";
import * as paymentsService from "./service.js";

const CreateIntentSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(["INR", "JPY"]),
  targetCurrency: z.enum(["INR", "JPY"]),
  paymentMethod: z.enum(["upi", "jpy_bank_transfer", "jpy_card", "konbini"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

async function resolveMerchantIdForUser(userId: string): Promise<string> {
  const merchant = await prisma.merchant.findFirst({ where: { userId } });
  if (!merchant) throw new ForbiddenError("user is not a registered merchant");
  return merchant.id;
}

export async function create(req: Request, res: Response) {
  if (!req.auth) throw new UnauthorizedError();
  const body = CreateIntentSchema.parse(req.body);
  const idempotencyKey = req.header(IDEMPOTENCY_HEADER);
  if (!idempotencyKey) throw new ValidationError(`${IDEMPOTENCY_HEADER} header required`);

  const merchantId = await resolveMerchantIdForUser(req.auth.sub);
  const result = await paymentsService.createPaymentIntent({
    merchantId,
    userId: req.auth.sub,
    amount: body.amount,
    currency: body.currency,
    targetCurrency: body.targetCurrency,
    paymentMethod: body.paymentMethod,
    metadata: body.metadata,
    idempotencyKey,
  });

  res.status(201).json(result);
}

export async function get(req: Request, res: Response) {
  if (!req.auth) throw new UnauthorizedError();
  const { id } = req.params;
  if (!id) throw new ValidationError("id required");

  const merchantId = await resolveMerchantIdForUser(req.auth.sub);
  const intent = await paymentsService.getPaymentIntent(id, merchantId);
  res.json({ intent });
}

export async function refund(req: Request, res: Response) {
  if (!req.auth) throw new UnauthorizedError();
  const { id } = req.params;
  if (!id) throw new ValidationError("id required");

  const merchantId = await resolveMerchantIdForUser(req.auth.sub);
  const intent = await paymentsService.refund(id, merchantId);
  res.json({ intent });
}
