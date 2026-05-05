import { createHash, randomUUID } from "node:crypto";
import { config } from "../../../config/index.js";
import { logger } from "../../../utils/logger.js";
import type { FxProvider } from "./types.js";

const isConfigured = Boolean(config.WISE_API_TOKEN) && Boolean(config.WISE_PROFILE_ID);

const baseUrl = config.WISE_API_URL.replace(/\/$/, "");

async function wiseRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.WISE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wise ${init.method ?? "GET"} ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

// Mid-market reference rates used only when WISE is not configured.
// These are illustrative for dev only; they are NOT for production use.
const MOCK_MID_MARKET: Record<string, number> = {
  "INR_JPY": 1.85,    // 1 INR ≈ 1.85 JPY
  "JPY_INR": 0.54,    // 1 JPY ≈ 0.54 INR
};

export const wiseProvider: FxProvider = {
  name: "wise",

  async getQuote({ from, to, sourceAmountMinor, targetAmountMinor }) {
    if (!isConfigured) {
      logger.warn("wise not configured — returning mock FX quote");
      const rate = MOCK_MID_MARKET[`${from}_${to}`];
      if (!rate) throw new Error(`No mock rate for ${from}->${to}`);
      return {
        providerQuoteId: `quote_mock_${randomUUID()}`,
        rate,
        rawRate: rate,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        raw: { mock: true, from, to, rate },
      };
    }

    const body: Record<string, unknown> = {
      sourceCurrency: from,
      targetCurrency: to,
      profile: Number(config.WISE_PROFILE_ID),
    };
    if (sourceAmountMinor != null) body.sourceAmount = sourceAmountMinor / 100;
    if (targetAmountMinor != null) body.targetAmount = targetAmountMinor / 100;

    const quote = (await wiseRequest("/v3/profiles/" + config.WISE_PROFILE_ID + "/quotes", {
      method: "POST",
      body: JSON.stringify(body),
    })) as {
      id: string;
      rate: number;
      expirationTime: string;
    };

    return {
      providerQuoteId: quote.id,
      rate: quote.rate,
      rawRate: quote.rate,
      expiresAt: new Date(quote.expirationTime),
      raw: quote,
    };
  },

  async createTransfer({ quoteId, referenceId }) {
    if (!isConfigured) {
      logger.warn({ referenceId, quoteId }, "wise not configured — returning mock transfer");
      return {
        providerTransferId: `transfer_mock_${randomUUID()}`,
        raw: { mock: true, quoteId, referenceId },
      };
    }

    const transfer = (await wiseRequest("/v1/transfers", {
      method: "POST",
      body: JSON.stringify({
        targetAccount: null,        // requires a recipient set up in Wise dashboard
        quoteUuid: quoteId,
        customerTransactionId: referenceId,
        details: {
          reference: referenceId.slice(0, 12),
          transferPurpose: "verification.transfers.purpose.other",
          sourceOfFunds: "verification.source.of.funds.other",
        },
      }),
    })) as { id: number };

    return { providerTransferId: String(transfer.id), raw: transfer };
  },

  verifyWebhookSignature(rawBody, signature) {
    // Wise uses RSA-SHA256 with their public key. For brevity in MVP we
    // require WISE_WEBHOOK_PUBKEY env (not yet wired) and otherwise accept
    // in dev. Replace with proper RSA verify before production.
    if (!signature) return false;
    if (!isConfigured) {
      logger.warn("wise webhook signature accepted (dev) — sig hash %s", hashHead(rawBody));
      return true;
    }
    return signature.length > 0;
  },
};

export const wiseConfigured = isConfigured;

function hashHead(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 12);
}
