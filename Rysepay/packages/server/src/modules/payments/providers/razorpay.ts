import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { config } from "../../../config/index.js";
import { logger } from "../../../utils/logger.js";
import type { UpiCollectionProvider } from "./types.js";

const isConfigured =
  Boolean(config.RAZORPAY_KEY_ID) &&
  Boolean(config.RAZORPAY_KEY_SECRET) &&
  Boolean(config.RAZORPAY_WEBHOOK_SECRET);

const client = isConfigured
  ? new Razorpay({
      key_id: config.RAZORPAY_KEY_ID,
      key_secret: config.RAZORPAY_KEY_SECRET,
    })
  : null;

export const razorpayProvider: UpiCollectionProvider = {
  name: "razorpay",

  async createOrder({ amountMinor, currency, referenceId, notes }) {
    if (!client) {
      logger.warn(
        { referenceId },
        "razorpay not configured — returning mock order. set RAZORPAY_KEY_ID/SECRET in .env to use sandbox.",
      );
      return {
        providerOrderId: `order_mock_${referenceId}`,
        raw: { mock: true, amount: amountMinor, currency, referenceId },
      };
    }

    const order = await client.orders.create({
      amount: amountMinor,
      currency,
      receipt: referenceId,
      notes: notes ?? {},
      payment_capture: true,
    });

    return { providerOrderId: order.id, raw: order };
  },

  verifyWebhookSignature(rawBody, signature) {
    if (!config.RAZORPAY_WEBHOOK_SECRET) {
      // In dev with no key, accept (so mocks work). Logged for visibility.
      logger.warn("razorpay webhook secret missing — accepting unsigned in dev");
      return true;
    }
    const expected = createHmac("sha256", config.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },
};

export const razorpayConfigured = isConfigured;
