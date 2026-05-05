import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { razorpayProvider } from "./providers/razorpay.js";
import { stripeProvider } from "./providers/stripe.js";
import * as fxService from "../fx/service.js";
import * as ledgerService from "../ledger/service.js";
import { deliverToMerchant } from "../notifications/merchantWebhook.js";
import { assertTransition } from "./state.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors.js";
import type {
  Currency,
  PaymentIntentStatus,
  PaymentMethod,
} from "@ryse/shared/types";

const INTENT_PREFIX = "pi_";

function generateIntentId(): string {
  return INTENT_PREFIX + randomBytes(12).toString("base64url");
}

function generateTxnId(): string {
  return "txn_" + randomBytes(12).toString("base64url");
}

// JPY is zero-decimal, INR uses 2 decimals (paise).
function toMinorUnits(amount: Prisma.Decimal | number, currency: Currency): number {
  const a = amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount);
  if (currency === "JPY") return a.toDecimalPlaces(0).toNumber();
  return a.mul(100).toDecimalPlaces(0).toNumber();
}

export interface CreateIntentInput {
  merchantId: string;
  userId?: string;
  amount: number;
  currency: Currency;
  targetCurrency: Currency;
  paymentMethod?: PaymentMethod;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export async function createPaymentIntent(input: CreateIntentInput) {
  if (input.amount <= 0) throw new ValidationError("amount must be positive");

  const merchant = await prisma.merchant.findUnique({ where: { id: input.merchantId } });
  if (!merchant) throw new NotFoundError("merchant not found");
  if (merchant.status !== "active") throw new ConflictError("merchant not active");

  // Lock FX rate if currencies differ.
  let fxRate: number | null = null;
  let fxRateLockedAt: Date | null = null;
  if (input.currency !== input.targetCurrency) {
    const quote = await fxService.lockQuote({
      from: input.currency,
      to: input.targetCurrency,
      amount: input.amount,
    });
    fxRate = quote.rate;
    fxRateLockedAt = new Date();
  }

  const intent = await prisma.paymentIntent.create({
    data: {
      intentId: generateIntentId(),
      idempotencyKey: input.idempotencyKey,
      merchantId: input.merchantId,
      userId: input.userId,
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency,
      targetCurrency: input.targetCurrency,
      fxRate: fxRate != null ? new Prisma.Decimal(fxRate) : null,
      fxRateLockedAt,
      status: "created",
      paymentMethod: input.paymentMethod,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  // Create the provider-side artifact (UPI order or JPY payment intent).
  let providerData: { providerId: string; clientSecret?: string; raw: unknown };
  if (input.currency === "INR") {
    const order = await razorpayProvider.createOrder({
      amountMinor: toMinorUnits(intent.amount, "INR"),
      currency: "INR",
      referenceId: intent.intentId,
      notes: { merchantId: merchant.merchantId },
    });
    providerData = { providerId: order.providerOrderId, raw: order.raw };
  } else if (input.currency === "JPY") {
    const pmTypes: ("card" | "konbini")[] =
      input.paymentMethod === "konbini" ? ["konbini"] : ["card"];
    const pi = await stripeProvider.createPaymentIntent({
      amountMinor: toMinorUnits(intent.amount, "JPY"),
      currency: "JPY",
      referenceId: intent.intentId,
      paymentMethodTypes: pmTypes,
      metadata: { merchantId: merchant.merchantId },
    });
    providerData = { providerId: pi.providerIntentId, clientSecret: pi.clientSecret, raw: pi.raw };
  } else {
    throw new ValidationError(`Unsupported currency: ${input.currency}`);
  }

  // Record an initial pending transaction with provider ref.
  await prisma.transaction.create({
    data: {
      paymentIntentId: intent.id,
      transactionId: generateTxnId(),
      type: "payment",
      amount: intent.amount,
      currency: intent.currency,
      fxConvertedAmount:
        fxRate != null ? new Prisma.Decimal(input.amount).mul(fxRate) : null,
      fxConvertedCurrency: fxRate != null ? input.targetCurrency : null,
      status: "pending",
      externalReference: providerData.providerId,
    },
  });

  return {
    intent: serializeIntent(intent),
    provider: {
      name: input.currency === "INR" ? "razorpay" : "stripe",
      providerId: providerData.providerId,
      clientSecret: providerData.clientSecret,
    },
  };
}

export async function getPaymentIntent(intentId: string, merchantId: string) {
  const intent = await prisma.paymentIntent.findFirst({
    where: { intentId, merchantId },
    include: { transactions: true },
  });
  if (!intent) throw new NotFoundError("payment intent not found");
  return serializeIntent(intent);
}

export async function transitionStatus(
  intentDbId: string,
  to: PaymentIntentStatus,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const runner = tx ?? prisma;
  const current = await runner.paymentIntent.findUniqueOrThrow({ where: { id: intentDbId } });
  assertTransition(current.status, to);
  await runner.paymentIntent.update({ where: { id: intentDbId }, data: { status: to } });
}

// Called from webhooks after payment confirmation.
// Posts the ledger entries that move money from user -> fx reserve -> merchant.
export async function settleSuccessfulPayment(intentDbId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findUniqueOrThrow({
      where: { id: intentDbId },
      include: { transactions: { where: { type: "payment" }, orderBy: { createdAt: "asc" } } },
    });
    if (intent.status === "completed") return; // idempotent
    assertTransition(intent.status, "processing");
    await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "processing" } });

    const transaction = intent.transactions[0];
    if (!transaction) throw new ConflictError("no payment transaction found");

    const fxReserveSrc = await ledgerService.getOrCreateSystemAccount(
      "fx_reserve",
      intent.currency,
      tx,
    );
    const merchantAcct = await ledgerService.getOrCreateMerchantSettlementAccount(
      intent.merchantId,
      intent.targetCurrency,
      tx,
    );

    const sourceAmount = intent.amount;
    const targetAmount =
      intent.fxRate && intent.currency !== intent.targetCurrency
        ? intent.amount.mul(intent.fxRate)
        : intent.amount;

    if (intent.currency === intent.targetCurrency) {
      // No FX leg: source amount goes straight from fx_reserve(src) -> merchant.
      await ledgerService.postEntries(
        transaction.id,
        [
          { accountId: fxReserveSrc, entryType: "debit", amount: sourceAmount, currency: intent.currency },
          { accountId: merchantAcct, entryType: "credit", amount: sourceAmount, currency: intent.currency },
        ],
        tx,
      );
    } else {
      const fxReserveDst = await ledgerService.getOrCreateSystemAccount(
        "fx_reserve",
        intent.targetCurrency,
        tx,
      );
      // Two balanced sets of legs (one per currency).
      await ledgerService.postEntries(
        transaction.id,
        [
          // Source side: provider gave us source-currency, we move it into the fx_reserve.
          { accountId: fxReserveSrc, entryType: "credit", amount: sourceAmount, currency: intent.currency },
          { accountId: fxReserveSrc, entryType: "debit",  amount: sourceAmount, currency: intent.currency },
          // Target side: fx_reserve(target) credits the merchant.
          { accountId: fxReserveDst, entryType: "debit",  amount: targetAmount, currency: intent.targetCurrency },
          { accountId: merchantAcct, entryType: "credit", amount: targetAmount, currency: intent.targetCurrency },
        ],
        tx,
      );
    }

    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: "completed" },
    });
    await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "completed" } });
  });

  // Fire-and-forget merchant notification (handles its own retries).
  const fresh = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentDbId } });
  void deliverToMerchant(fresh.merchantId, {
    type: "payment.completed",
    data: {
      intentId: fresh.intentId,
      amount: fresh.amount.toString(),
      currency: fresh.currency,
      targetCurrency: fresh.targetCurrency,
      fxRate: fresh.fxRate?.toString() ?? null,
    },
  });
}

export async function markFailed(intentDbId: string, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intentDbId } });
    if (intent.status === "failed" || intent.status === "completed") return;
    assertTransition(intent.status, "failed");
    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: "failed",
        metadata: { ...((intent.metadata as object) ?? {}), failure_reason: reason },
      },
    });
    await tx.transaction.updateMany({
      where: { paymentIntentId: intent.id, type: "payment", status: "pending" },
      data: { status: "failed" },
    });
  });
}

export async function refund(intentId: string, merchantId: string) {
  return prisma.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findFirst({
      where: { intentId, merchantId },
      include: { transactions: true },
    });
    if (!intent) throw new NotFoundError("payment intent not found");
    if (intent.status !== "completed") {
      throw new ConflictError(`cannot refund intent in status ${intent.status}`);
    }
    assertTransition(intent.status, "refunded");

    const original = intent.transactions.find((t) => t.type === "payment");
    if (!original) throw new ConflictError("no original payment transaction");

    const refundTxn = await tx.transaction.create({
      data: {
        paymentIntentId: intent.id,
        transactionId: generateTxnId(),
        type: "refund",
        amount: intent.amount,
        currency: intent.currency,
        fxConvertedAmount: original.fxConvertedAmount,
        fxConvertedCurrency: original.fxConvertedCurrency,
        status: "completed",
        externalReference: original.externalReference,
      },
    });

    // Reverse the original ledger entries by mirroring debits/credits.
    const originalEntries = await tx.ledgerEntry.findMany({
      where: { transactionId: original.id },
    });

    const reversalLegs = originalEntries.map((e) => ({
      accountId: e.accountId,
      entryType: (e.entryType === "debit" ? "credit" : "debit") as "debit" | "credit",
      amount: e.amount,
      currency: e.currency,
    }));
    if (reversalLegs.length > 0) {
      await ledgerService.postEntries(refundTxn.id, reversalLegs, tx);
    }

    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: { status: "refunded" },
    });

    return serializeIntent(await tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }));
  });
}

function serializeIntent(intent: {
  intentId: string;
  amount: Prisma.Decimal;
  currency: Currency;
  targetCurrency: Currency;
  fxRate: Prisma.Decimal | null;
  status: PaymentIntentStatus;
  paymentMethod: PaymentMethod | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  transactions?: Array<{ transactionId: string; type: string; status: string; createdAt: Date }>;
}) {
  return {
    intentId: intent.intentId,
    amount: intent.amount.toString(),
    currency: intent.currency,
    targetCurrency: intent.targetCurrency,
    fxRate: intent.fxRate?.toString() ?? null,
    status: intent.status,
    paymentMethod: intent.paymentMethod,
    metadata: intent.metadata,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
    transactions: intent.transactions?.map((t) => ({
      transactionId: t.transactionId,
      type: t.type,
      status: t.status,
      createdAt: t.createdAt,
    })),
  };
}

export async function findIntentByExternalRef(externalRef: string) {
  // Used by webhook handlers to look up a payment intent by provider order id.
  const txn = await prisma.transaction.findFirst({
    where: { externalReference: externalRef, type: "payment" },
    include: { paymentIntent: true },
  });
  return txn?.paymentIntent ?? null;
}

export async function findIntentByPublicId(intentId: string) {
  return prisma.paymentIntent.findUnique({ where: { intentId } });
}
