import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import type { Currency } from "@ryse/shared/types";

const MERCHANT_ID_PREFIX = "mch_";

function generateMerchantId(): string {
  return MERCHANT_ID_PREFIX + randomBytes(12).toString("base64url");
}

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `sk_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash, prefix: raw.slice(0, 8) };
}

export interface RegisterMerchantInput {
  userId: string;
  businessName: string;
  settlementCurrency: Currency;
  webhookUrl?: string;
}

export async function registerMerchant(input: RegisterMerchantInput) {
  const existing = await prisma.merchant.findFirst({ where: { userId: input.userId } });
  if (existing) throw new ConflictError("User already has a merchant account");

  const apiKey = generateApiKey();

  const merchant = await prisma.merchant.create({
    data: {
      userId: input.userId,
      businessName: input.businessName,
      merchantId: generateMerchantId(),
      settlementCurrency: input.settlementCurrency,
      webhookUrl: input.webhookUrl,
      apiKeyHash: apiKey.hash,
      apiKeyPrefix: apiKey.prefix,
    },
  });

  // Promote the user to merchant role if they're still a consumer
  await prisma.user.update({
    where: { id: input.userId },
    data: { userType: "merchant" },
  });

  return {
    merchant: serialize(merchant),
    // Plaintext key returned ONLY on creation. Never stored or returned again.
    apiKey: apiKey.raw,
  };
}

export async function getMerchantByUserId(userId: string) {
  const merchant = await prisma.merchant.findFirst({ where: { userId } });
  if (!merchant) throw new NotFoundError("Merchant account not found");
  return serialize(merchant);
}

function serialize(m: {
  merchantId: string;
  businessName: string;
  settlementCurrency: Currency;
  status: "active" | "suspended" | "inactive";
  webhookUrl: string | null;
  apiKeyPrefix: string;
  createdAt: Date;
}) {
  return {
    merchantId: m.merchantId,
    businessName: m.businessName,
    settlementCurrency: m.settlementCurrency,
    status: m.status,
    webhookUrl: m.webhookUrl,
    apiKeyPrefix: m.apiKeyPrefix,
    createdAt: m.createdAt,
  };
}
