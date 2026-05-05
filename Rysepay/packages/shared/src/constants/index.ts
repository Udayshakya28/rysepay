export const SUPPORTED_CURRENCIES = ["INR", "JPY"] as const;
export const SUPPORTED_COUNTRIES = ["IN", "JP"] as const;

export const FX_QUOTE_TTL_SECONDS = 5 * 60;        // 5 minutes
export const FX_RATE_CACHE_TTL_SECONDS = 5 * 60;   // 5 minutes
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;   // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const REQUEST_ID_HEADER = "X-Request-Id";

export const DEFAULT_FX_SPREAD_BPS = 50; // 0.50% — applied on top of mid-market rate
