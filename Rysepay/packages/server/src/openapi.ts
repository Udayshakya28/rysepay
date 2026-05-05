// Hand-written OpenAPI 3.0 spec — just the public-facing endpoints.
// Kept in sync with the routes in src/modules/*/routes.ts.

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Ryse Payments API",
    version: "0.1.0",
    description: "UPI Without Borders — cross-border INR↔JPY payment platform.",
  },
  servers: [{ url: "http://localhost:3000" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
            },
            required: ["code", "message"],
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          userType: { type: "string", enum: ["consumer", "merchant", "admin"] },
          kycStatus: { type: "string", enum: ["pending", "verified", "rejected"] },
          countryCode: { type: "string", enum: ["IN", "JP"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Tokens: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          expiresAt: { type: "string", format: "date-time" },
        },
      },
      Merchant: {
        type: "object",
        properties: {
          merchantId: { type: "string" },
          businessName: { type: "string" },
          settlementCurrency: { type: "string", enum: ["INR", "JPY"] },
          status: { type: "string", enum: ["active", "suspended", "inactive"] },
          webhookUrl: { type: "string", nullable: true },
          apiKeyPrefix: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      PaymentIntent: {
        type: "object",
        properties: {
          intentId: { type: "string" },
          amount: { type: "string" },
          currency: { type: "string", enum: ["INR", "JPY"] },
          targetCurrency: { type: "string", enum: ["INR", "JPY"] },
          fxRate: { type: "string", nullable: true },
          status: {
            type: "string",
            enum: ["created", "processing", "completed", "failed", "refunded", "disputed"],
          },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      FxRate: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          rate: { type: "number" },
          midRate: { type: "number" },
          spreadBps: { type: "integer" },
          source: { type: "string" },
          fetchedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Liveness + dependency check",
        responses: { "200": { description: "Service healthy" } },
      },
    },
    "/auth/register": {
      post: {
        summary: "Register a user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "countryCode"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  userType: { type: "string", enum: ["consumer", "merchant"] },
                  countryCode: { type: "string", enum: ["IN", "JP"] },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "User created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
          },
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Log in",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Tokens",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Tokens" } } },
          },
        },
      },
    },
    "/auth/refresh": {
      post: { summary: "Rotate refresh token", responses: { "200": { description: "New tokens" } } },
    },
    "/auth/logout": {
      post: { summary: "Revoke a refresh token", responses: { "204": { description: "OK" } } },
    },
    "/v1/merchants/register": {
      post: {
        summary: "Register a merchant account (returns plaintext API key once)",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Merchant created" } },
      },
    },
    "/v1/merchants/me": {
      get: {
        summary: "Current merchant profile",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Merchant" } },
      },
    },
    "/v1/merchants/settlements": {
      get: {
        summary: "List settlements",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Settlements" } },
      },
    },
    "/v1/merchants/transactions": {
      get: {
        summary: "List transactions",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Transactions" } },
      },
    },
    "/v1/payments/intents": {
      post: {
        summary: "Create a payment intent",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["amount", "currency", "targetCurrency"],
                properties: {
                  amount: { type: "number" },
                  currency: { type: "string", enum: ["INR", "JPY"] },
                  targetCurrency: { type: "string", enum: ["INR", "JPY"] },
                  paymentMethod: {
                    type: "string",
                    enum: ["upi", "jpy_bank_transfer", "jpy_card", "konbini"],
                  },
                  metadata: { type: "object" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/v1/payments/intents/{id}": {
      get: {
        summary: "Get a payment intent",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Intent" } },
      },
    },
    "/v1/payments/{id}/refund": {
      post: {
        summary: "Refund a payment",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Refunded" } },
      },
    },
    "/v1/fx/rates": {
      get: {
        summary: "Get current FX rate",
        parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", enum: ["INR", "JPY"] } },
          { name: "to", in: "query", required: true, schema: { type: "string", enum: ["INR", "JPY"] } },
        ],
        responses: {
          "200": {
            description: "Rate",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FxRate" } } },
          },
        },
      },
    },
    "/v1/fx/quotes": {
      post: {
        summary: "Lock an FX quote",
        responses: { "201": { description: "Quote" } },
      },
    },
    "/webhooks/razorpay": {
      post: { summary: "Razorpay webhook receiver", responses: { "200": { description: "OK" } } },
    },
    "/webhooks/wise": {
      post: { summary: "Wise webhook receiver", responses: { "200": { description: "OK" } } },
    },
    "/webhooks/stripe": {
      post: { summary: "Stripe webhook receiver", responses: { "200": { description: "OK" } } },
    },
  },
};
