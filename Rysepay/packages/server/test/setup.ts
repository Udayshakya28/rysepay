// Test environment defaults — applied before any test imports.
// Real env values (.env) override these if set.

import "dotenv/config";

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-test-jwt-secret";
}
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = "0".repeat(64);
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://ryse:ryse_dev@localhost:5432/ryse_payments";
}
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = "redis://localhost:6379";
}
process.env.NODE_ENV = "test";
