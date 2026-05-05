import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";
import type { UserType } from "@ryse/shared/types";

export interface JwtPayload {
  sub: string;          // user id
  userType: UserType;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Missing bearer token"));
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    req.auth = decoded;
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
};

export const requireRole = (...roles: UserType[]): RequestHandler => {
  return (req, _res, next) => {
    if (!req.auth) return next(new UnauthorizedError());
    if (!roles.includes(req.auth.userType)) return next(new ForbiddenError());
    next();
  };
};
