import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: "not_found", message: "Route not found" },
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Zod validation issues
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Request validation failed",
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Unknown / unexpected
  req.log?.error({ err }, "unhandled error");
  res.status(500).json({
    error: { code: "internal_error", message: "Internal server error" },
  });
};
