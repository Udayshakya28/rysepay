import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { config } from "../../../config/index.js";
import { logger } from "../../../utils/logger.js";
import type { JpyCollectionProvider } from "./types.js";

const isConfigured = Boolean(config.STRIPE_SECRET_KEY);

const client = isConfigured
  ? new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: "2025-09-30.clover" as Stripe.LatestApiVersion })
  : null;

export const stripeProvider: JpyCollectionProvider = {
  name: "stripe",

  async createPaymentIntent({ amountMinor, currency, referenceId, paymentMethodTypes, metadata }) {
    if (!client) {
      logger.warn({ referenceId }, "stripe not configured — returning mock payment intent");
      const id = `pi_mock_${randomUUID()}`;
      return {
        providerIntentId: id,
        clientSecret: `${id}_secret_mock`,
        raw: { mock: true, amount: amountMinor, currency, referenceId },
      };
    }

    const intent = await client.paymentIntents.create({
      amount: amountMinor,
      currency: currency.toLowerCase(),
      payment_method_types: paymentMethodTypes,
      metadata: { referenceId, ...metadata },
    });

    return {
      providerIntentId: intent.id,
      clientSecret: intent.client_secret ?? "",
      raw: intent,
    };
  },

  verifyWebhookSignature(rawBody, signature, timestampToleranceSec = 300) {
    if (!config.STRIPE_WEBHOOK_SECRET) {
      logger.warn("stripe webhook secret missing — accepting unsigned in dev");
      return true;
    }
    if (!client) return false;
    try {
      client.webhooks.constructEvent(
        rawBody,
        signature,
        config.STRIPE_WEBHOOK_SECRET,
        timestampToleranceSec,
      );
      return true;
    } catch (err) {
      logger.warn({ err }, "stripe webhook signature verification failed");
      return false;
    }
  },
};

export const stripeConfigured = isConfigured;
export const stripeClient = client;
