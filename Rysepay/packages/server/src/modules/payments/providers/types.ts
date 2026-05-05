// Provider abstraction layer.
//
// Each provider implements a small, focused contract. The orchestrator
// (payments service) talks to providers via these interfaces, never against
// SDK types directly. This makes it easy to add a new provider, swap one out,
// or run mocks in tests.

import type { Currency } from "@ryse/shared/types";

// ── INDIA: UPI collection (Razorpay) ───────────────────────────

export interface UpiCollectionProvider {
  readonly name: "razorpay";

  /** Create an order/charge for INR collection via UPI. */
  createOrder(input: {
    amountMinor: number;          // INR in paise
    currency: "INR";
    referenceId: string;          // our intent_id; surfaces back via webhook
    notes?: Record<string, string>;
  }): Promise<{ providerOrderId: string; raw: unknown }>;

  /** Verify a webhook delivery using HMAC. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

// ── CROSS-BORDER FX (Wise) ─────────────────────────────────────

export interface FxProvider {
  readonly name: "wise";

  /** Get a fresh quote for converting `from` -> `to`. */
  getQuote(input: {
    from: Currency;
    to: Currency;
    sourceAmountMinor?: number;
    targetAmountMinor?: number;
  }): Promise<{ providerQuoteId: string; rate: number; rawRate: number; expiresAt: Date; raw: unknown }>;

  /** Create a transfer using a quote. */
  createTransfer(input: {
    quoteId: string;
    referenceId: string;
  }): Promise<{ providerTransferId: string; raw: unknown }>;

  /** Verify webhook signature (Wise uses public key signatures). */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

// ── JAPAN: payment collection (Stripe) ─────────────────────────

export interface JpyCollectionProvider {
  readonly name: "stripe";

  createPaymentIntent(input: {
    amountMinor: number;          // JPY is zero-decimal — already minor
    currency: "JPY";
    referenceId: string;
    paymentMethodTypes: ("card" | "konbini")[];
    metadata?: Record<string, string>;
  }): Promise<{ providerIntentId: string; clientSecret: string; raw: unknown }>;

  verifyWebhookSignature(rawBody: string, signature: string, timestampToleranceSec?: number): boolean;
}

// ── Result types ───────────────────────────────────────────────

export interface ProviderHealth {
  name: string;
  configured: boolean;
}
