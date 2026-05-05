import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { redis } from "../../db/redis.js";
import { wiseProvider } from "../payments/providers/wise.js";
import {
  DEFAULT_FX_SPREAD_BPS,
  FX_QUOTE_TTL_SECONDS,
  FX_RATE_CACHE_TTL_SECONDS,
} from "@ryse/shared/constants";
import type { Currency } from "@ryse/shared/types";
import { ValidationError } from "../../utils/errors.js";

const RATE_CACHE_KEY = (from: Currency, to: Currency) => `fx:rate:${from}:${to}`;
const QUOTE_KEY = (id: string) => `fx:quote:${id}`;

export interface FxRateResult {
  from: Currency;
  to: Currency;
  rate: number;            // effective rate (mid + spread)
  midRate: number;         // raw mid-market rate
  spreadBps: number;
  source: string;
  fetchedAt: string;
}

export interface FxQuoteResult {
  quoteId: string;
  from: Currency;
  to: Currency;
  rate: number;
  expiresAt: string;
  amount?: number;
  convertedAmount?: number;
}

export async function getRate(from: Currency, to: Currency): Promise<FxRateResult> {
  if (from === to) throw new ValidationError("from and to must differ");

  const cacheKey = RATE_CACHE_KEY(from, to);
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as FxRateResult;

  const quote = await wiseProvider.getQuote({ from, to });
  const spread = DEFAULT_FX_SPREAD_BPS / 10_000;        // bps -> ratio
  const effective = quote.rawRate * (1 - spread);       // we keep the spread

  const result: FxRateResult = {
    from,
    to,
    rate: round8(effective),
    midRate: round8(quote.rawRate),
    spreadBps: DEFAULT_FX_SPREAD_BPS,
    source: wiseProvider.name,
    fetchedAt: new Date().toISOString(),
  };

  // Persist to fx_rates table for audit trail.
  await prisma.fxRate.create({
    data: {
      fromCurrency: from,
      toCurrency: to,
      rate: new Prisma.Decimal(quote.rawRate),
      spread: new Prisma.Decimal(spread),
      effectiveRate: new Prisma.Decimal(effective),
      source: wiseProvider.name,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + FX_RATE_CACHE_TTL_SECONDS * 1000),
    },
  });

  await redis.set(cacheKey, JSON.stringify(result), "EX", FX_RATE_CACHE_TTL_SECONDS);
  return result;
}

export async function lockQuote(input: {
  from: Currency;
  to: Currency;
  amount: number;        // in `from` units, decimal
}): Promise<FxQuoteResult> {
  const rate = await getRate(input.from, input.to);
  const converted = round4(input.amount * rate.rate);
  const expiresAt = new Date(Date.now() + FX_QUOTE_TTL_SECONDS * 1000);

  const quoteId = `fxq_${cryptoRandomId()}`;
  const result: FxQuoteResult = {
    quoteId,
    from: input.from,
    to: input.to,
    rate: rate.rate,
    expiresAt: expiresAt.toISOString(),
    amount: input.amount,
    convertedAmount: converted,
  };

  await redis.set(QUOTE_KEY(quoteId), JSON.stringify(result), "EX", FX_QUOTE_TTL_SECONDS);
  return result;
}

export async function getLockedQuote(quoteId: string): Promise<FxQuoteResult | null> {
  const v = await redis.get(QUOTE_KEY(quoteId));
  return v ? (JSON.parse(v) as FxQuoteResult) : null;
}

function round8(n: number): number { return Math.round(n * 1e8) / 1e8; }
function round4(n: number): number { return Math.round(n * 1e4) / 1e4; }

function cryptoRandomId(): string {
  // 16 bytes of base64url
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
