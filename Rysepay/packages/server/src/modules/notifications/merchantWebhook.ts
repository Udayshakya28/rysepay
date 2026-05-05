// Merchant webhook delivery with HMAC signing + exponential-backoff retries.

import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../utils/logger.js";

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;
const TIMEOUT_MS = 5_000;

export interface MerchantWebhookPayload {
  type: string;
  data: Record<string, unknown>;
}

export async function deliverToMerchant(merchantId: string, payload: MerchantWebhookPayload): Promise<void> {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant?.webhookUrl) return;

  const event = {
    id: `evt_${randomUUID()}`,
    type: payload.type,
    createdAt: new Date().toISOString(),
    merchantId: merchant.merchantId,
    data: payload.data,
  };
  const body = JSON.stringify(event);
  const signature = createHmac("sha256", merchant.apiKeyHash).update(body).digest("hex");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(merchant.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ryse-Event": event.type,
          "X-Ryse-Event-Id": event.id,
          "X-Ryse-Signature": signature,
        },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(t);

      if (res.ok) {
        logger.info({ merchantId: merchant.merchantId, type: event.type, attempt }, "webhook delivered");
        return;
      }
      logger.warn(
        { merchantId: merchant.merchantId, type: event.type, attempt, status: res.status },
        "webhook non-2xx, retrying",
      );
    } catch (err) {
      logger.warn({ err, merchantId: merchant.merchantId, attempt }, "webhook delivery error");
    }
    // Exponential backoff: 500ms, 1s, 2s, 4s, 8s.
    const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
    await new Promise((r) => setTimeout(r, delay));
  }
  logger.error({ merchantId: merchant.merchantId, type: event.type }, "webhook permanently failed");
}
