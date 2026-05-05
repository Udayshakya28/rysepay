// Settlement batching.
//
// Once per day (cron in production, manual trigger in dev), we batch each
// merchant's completed transactions for that settlement window into a
// Settlement record. Money in the merchant's settlement account is what gets
// paid out; settlements are bookkeeping records of "as of this date, you've
// earned X".

import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../utils/logger.js";
import { deliverToMerchant } from "../notifications/merchantWebhook.js";
import { sendEmail } from "../notifications/email.js";

export async function runSettlementBatch(opts: { date?: Date } = {}): Promise<{
  date: string;
  settlementsCreated: number;
}> {
  const settlementDate = startOfDay(opts.date ?? new Date());
  const windowStart = new Date(settlementDate.getTime() - 24 * 3600 * 1000);

  const merchants = await prisma.merchant.findMany({
    where: { status: "active" },
    include: { user: true },
  });

  let created = 0;
  for (const merchant of merchants) {
    // Find completed payment transactions in the window for this merchant.
    const txns = await prisma.transaction.findMany({
      where: {
        type: "payment",
        status: "completed",
        createdAt: { gte: windowStart, lt: settlementDate },
        paymentIntent: { merchantId: merchant.id },
      },
      include: { paymentIntent: true },
    });

    if (txns.length === 0) continue;

    // Sum in merchant's settlement currency.
    const total = txns.reduce((acc, t) => {
      const amt =
        t.fxConvertedCurrency === merchant.settlementCurrency && t.fxConvertedAmount
          ? t.fxConvertedAmount
          : t.currency === merchant.settlementCurrency
            ? t.amount
            : new Prisma.Decimal(0);
      return acc.add(amt);
    }, new Prisma.Decimal(0));

    if (total.lte(0)) continue;

    const settlement = await prisma.settlement.create({
      data: {
        merchantId: merchant.id,
        settlementId: `stl_${randomBytes(8).toString("base64url")}`,
        settlementDate,
        totalAmount: total,
        currency: merchant.settlementCurrency,
        transactionCount: txns.length,
        status: "completed",
      },
    });
    created++;

    // Notify
    await Promise.allSettled([
      deliverToMerchant(merchant.id, {
        type: "settlement.created",
        data: {
          settlementId: settlement.settlementId,
          totalAmount: total.toString(),
          currency: merchant.settlementCurrency,
          transactionCount: txns.length,
          settlementDate: settlementDate.toISOString().slice(0, 10),
        },
      }),
      sendEmail({
        to: merchant.user.email,
        subject: `Settlement ${settlement.settlementId} — ${total} ${merchant.settlementCurrency}`,
        text: `Your settlement for ${settlementDate
          .toISOString()
          .slice(0, 10)} is ${total} ${merchant.settlementCurrency} across ${txns.length} transactions.`,
      }),
    ]);
  }

  logger.info({ created, date: settlementDate.toISOString() }, "settlement batch complete");
  return { date: settlementDate.toISOString().slice(0, 10), settlementsCreated: created };
}

export async function listForMerchant(merchantId: string) {
  return prisma.settlement.findMany({
    where: { merchantId },
    orderBy: { settlementDate: "desc" },
    take: 100,
  });
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}
