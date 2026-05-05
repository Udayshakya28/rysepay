// DB-backed idempotency.
//
// On a write that requires it (payment mutations), the client supplies
// `Idempotency-Key`. We store the key + a hash of the request body and the
// final response. If the same key arrives again with the SAME body, we replay
// the stored response. If with a DIFFERENT body, we reject 409.

import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { hashRequestBody } from "../utils/idempotency.js";
import { IDEMPOTENCY_HEADER } from "@ryse/shared/constants";
import { IdempotencyConflictError, ValidationError } from "../utils/errors.js";

const IDEMPOTENCY_TTL_HOURS = 24;

export interface IdempotencyOptions {
  scope: string;            // e.g. "payment_intent.create"
  required?: boolean;       // if true, missing key -> 400
}

export function withIdempotency(options: IdempotencyOptions): RequestHandler {
  const { scope, required = true } = options;

  return async (req, res, next) => {
    const key = req.header(IDEMPOTENCY_HEADER);

    if (!key) {
      if (required) return next(new ValidationError(`${IDEMPOTENCY_HEADER} header required`));
      return next();
    }

    const requestHash = hashRequestBody(req.body);

    try {
      const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
      if (existing) {
        if (existing.scope !== scope || existing.requestHash !== requestHash) {
          return next(new IdempotencyConflictError());
        }
        if (existing.responseBody && existing.statusCode) {
          // Replay
          res.status(existing.statusCode).json(existing.responseBody);
          return;
        }
        // Recorded but no response yet — likely a concurrent in-flight request.
        // Per Stripe's behavior, return 409 to signal client to retry.
        return next(new IdempotencyConflictError());
      }

      // Reserve the key. If two requests race, one will hit P2002.
      await prisma.idempotencyKey.create({
        data: {
          key,
          scope,
          requestHash,
          userId: req.auth?.sub,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Lost the race to reserve — treat as conflict, client should retry.
        return next(new IdempotencyConflictError());
      }
      return next(err);
    }

    // Wrap res.json to capture the response for replay.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      void prisma.idempotencyKey
        .update({
          where: { key },
          data: {
            responseBody: body as Prisma.InputJsonValue,
            statusCode: res.statusCode,
          },
        })
        .catch(() => {
          // Best effort — log via req
          req.log?.warn({ key }, "failed to persist idempotency response");
        });
      return originalJson(body);
    };

    next();
  };
}
