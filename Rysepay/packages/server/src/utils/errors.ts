export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(opts: { statusCode: number; code: string; message: string; details?: unknown }) {
    super(opts.message);
    this.name = this.constructor.name;
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.details = opts.details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ statusCode: 400, code: "validation_error", message, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super({ statusCode: 401, code: "unauthorized", message });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super({ statusCode: 403, code: "forbidden", message });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super({ statusCode: 404, code: "not_found", message });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ statusCode: 409, code: "conflict", message, details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super({ statusCode: 429, code: "rate_limited", message });
  }
}

export class IdempotencyConflictError extends AppError {
  constructor() {
    super({
      statusCode: 409,
      code: "idempotency_conflict",
      message: "Idempotency key was used with a different request body",
    });
  }
}
