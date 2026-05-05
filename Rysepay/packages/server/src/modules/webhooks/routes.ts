// Webhook receivers for Razorpay, Wise, Stripe.
//
// Each receiver:
// 1) verifies the provider's signature against the RAW body
// 2) parses the event
// 3) updates payment intent state and ledger via paymentsService
// 4) returns 200 quickly (we never make the provider wait on heavy work)

import { Router, type Request, type Response, raw } from "express";
import { razorpayProvider } from "../payments/providers/razorpay.js";
import { stripeProvider } from "../payments/providers/stripe.js";
import { wiseProvider } from "../payments/providers/wise.js";
import * as paymentsService from "../payments/service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { logger } from "../../utils/logger.js";
import { UnauthorizedError } from "../../utils/errors.js";

const router: Router = Router();

// Each receiver gets a raw body so signature verification works.
const rawJson = raw({ type: "application/json", limit: "1mb" });

// ── Razorpay ──────────────────────────────────────────────────
router.post(
  "/razorpay",
  rawJson,
  asyncHandler(async (req: Request, res: Response) => {
    const sig = (req.header("x-razorpay-signature") ?? "").toString();
    const body = (req.body as Buffer).toString("utf8");

    if (!razorpayProvider.verifyWebhookSignature(body, sig)) {
      throw new UnauthorizedError("invalid razorpay signature");
    }

    const event = JSON.parse(body) as {
      event: string;
      payload: { payment?: { entity?: { order_id?: string; status?: string; error_description?: string } } };
    };
    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id;

    if (!orderId) {
      logger.warn({ event: event.event }, "razorpay webhook without order_id");
      res.status(200).json({ ok: true });
      return;
    }

    const intent = await paymentsService.findIntentByExternalRef(orderId);
    if (!intent) {
      logger.warn({ orderId }, "razorpay webhook for unknown intent");
      res.status(200).json({ ok: true });
      return;
    }

    if (event.event === "payment.captured" || event.event === "payment.authorized") {
      await paymentsService.settleSuccessfulPayment(intent.id);
    } else if (event.event === "payment.failed") {
      await paymentsService.markFailed(intent.id, payment?.error_description ?? "razorpay reported failed");
    }

    res.status(200).json({ ok: true });
  }),
);

// ── Wise ──────────────────────────────────────────────────────
router.post(
  "/wise",
  rawJson,
  asyncHandler(async (req: Request, res: Response) => {
    const sig = (req.header("x-signature-sha256") ?? req.header("x-signature") ?? "").toString();
    const body = (req.body as Buffer).toString("utf8");

    if (!wiseProvider.verifyWebhookSignature(body, sig)) {
      throw new UnauthorizedError("invalid wise signature");
    }

    // Wise transfer state changes — we ack and log; the user-facing intent is
    // already settled when the source-side provider (razorpay/stripe) confirms.
    logger.info({ body: body.slice(0, 200) }, "wise webhook received");
    res.status(200).json({ ok: true });
  }),
);

// ── Stripe ────────────────────────────────────────────────────
router.post(
  "/stripe",
  rawJson,
  asyncHandler(async (req: Request, res: Response) => {
    const sig = (req.header("stripe-signature") ?? "").toString();
    const body = (req.body as Buffer).toString("utf8");

    if (!stripeProvider.verifyWebhookSignature(body, sig)) {
      throw new UnauthorizedError("invalid stripe signature");
    }

    const event = JSON.parse(body) as {
      type: string;
      data: { object: { id?: string; last_payment_error?: { message?: string } } };
    };
    const piId = event.data?.object?.id;
    if (!piId) {
      res.status(200).json({ ok: true });
      return;
    }

    const intent = await paymentsService.findIntentByExternalRef(piId);
    if (!intent) {
      logger.warn({ piId }, "stripe webhook for unknown intent");
      res.status(200).json({ ok: true });
      return;
    }

    if (event.type === "payment_intent.succeeded") {
      await paymentsService.settleSuccessfulPayment(intent.id);
    } else if (event.type === "payment_intent.payment_failed") {
      await paymentsService.markFailed(
        intent.id,
        event.data.object.last_payment_error?.message ?? "stripe reported failed",
      );
    }

    res.status(200).json({ ok: true });
  }),
);

export { router as webhooksRouter };
