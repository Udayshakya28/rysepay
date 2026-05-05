import type { Request, Response } from "express";
import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors.js";
import { prisma } from "../../db/prisma.js";
import * as merchantService from "./service.js";
import * as settlementsService from "../settlements/service.js";

const RegisterMerchantSchema = z.object({
  businessName: z.string().min(2).max(200),
  settlementCurrency: z.enum(["INR", "JPY"]),
  webhookUrl: z.string().url().optional(),
});

export async function register(req: Request, res: Response) {
  if (!req.auth) throw new UnauthorizedError();
  const body = RegisterMerchantSchema.parse(req.body);
  const result = await merchantService.registerMerchant({
    userId: req.auth.sub,
    ...body,
  });
  res.status(201).json(result);
}

export async function me(req: Request, res: Response) {
  if (!req.auth) throw new UnauthorizedError();
  const merchant = await merchantService.getMerchantByUserId(req.auth.sub);
  res.json({ merchant });
}

async function resolveMerchantDbId(userId: string): Promise<string> {
  const m = await prisma.merchant.findFirst({ where: { userId } });
  if (!m) throw new ForbiddenError("not a merchant");
  return m.id;
}

export async function listSettlements(req: Request, res: Response) {
  if (!req.auth) throw new UnauthorizedError();
  const merchantId = await resolveMerchantDbId(req.auth.sub);
  const settlements = await settlementsService.listForMerchant(merchantId);
  res.json({ settlements });
}

export async function listTransactions(req: Request, res: Response) {
  if (!req.auth) throw new UnauthorizedError();
  const merchantId = await resolveMerchantDbId(req.auth.sub);

  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const before = typeof req.query.before === "string" ? new Date(req.query.before) : undefined;

  const txns = await prisma.transaction.findMany({
    where: {
      paymentIntent: { merchantId },
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      paymentIntent: {
        select: {
          intentId: true,
          amount: true,
          currency: true,
          targetCurrency: true,
          status: true,
        },
      },
    },
  });

  res.json({
    transactions: txns.map((t) => ({
      transactionId: t.transactionId,
      type: t.type,
      amount: t.amount.toString(),
      currency: t.currency,
      fxConvertedAmount: t.fxConvertedAmount?.toString() ?? null,
      fxConvertedCurrency: t.fxConvertedCurrency,
      status: t.status,
      externalReference: t.externalReference,
      createdAt: t.createdAt,
      paymentIntent: t.paymentIntent && {
        intentId: t.paymentIntent.intentId,
        amount: t.paymentIntent.amount.toString(),
        currency: t.paymentIntent.currency,
        targetCurrency: t.paymentIntent.targetCurrency,
        status: t.paymentIntent.status,
      },
    })),
  });
}
