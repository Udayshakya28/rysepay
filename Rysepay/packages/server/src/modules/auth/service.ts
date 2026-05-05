import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { prisma } from "../../db/prisma.js";
import { redis } from "../../db/redis.js";
import { config } from "../../config/index.js";
import {
  ConflictError,
  UnauthorizedError,
} from "../../utils/errors.js";
import type { CountryCode, UserType } from "@ryse/shared/types";
import type { JwtPayload } from "../../middleware/auth.js";

const REFRESH_TOKEN_BYTES = 48;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  } as SignOptions);
}

function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

function refreshTokenExpiry(): Date {
  // Parse "7d", "24h", etc. Simple impl for our supported formats.
  const m = config.REFRESH_TOKEN_EXPIRES_IN.match(/^(\d+)([smhd])$/);
  if (!m) throw new Error("Invalid REFRESH_TOKEN_EXPIRES_IN");
  const value = Number(m[1]);
  const unit = m[2];
  const ms =
    unit === "s" ? value * 1000 :
    unit === "m" ? value * 60_000 :
    unit === "h" ? value * 3_600_000 :
    value * 86_400_000;
  return new Date(Date.now() + ms);
}

export interface RegisterInput {
  email: string;
  password: string;
  userType: UserType;
  countryCode: CountryCode;
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("Email already registered");

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      userType: input.userType,
      countryCode: input.countryCode,
    },
    select: {
      id: true,
      email: true,
      userType: true,
      kycStatus: true,
      countryCode: true,
      createdAt: true,
    },
  });

  return user;
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) throw new UnauthorizedError("Invalid credentials");
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) throw new UnauthorizedError("Invalid credentials");

  const tokens = await issueTokens({
    sub: user.id,
    email: user.email,
    userType: user.userType,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      userType: user.userType,
      kycStatus: user.kycStatus,
      countryCode: user.countryCode,
      createdAt: user.createdAt,
    },
    ...tokens,
  };
}

export async function issueTokens(payload: JwtPayload) {
  const accessToken = signAccessToken(payload);
  const refreshToken = generateRefreshToken();
  const expiresAt = refreshTokenExpiry();
  await prisma.refreshToken.create({
    data: {
      userId: payload.sub,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });
  return { accessToken, refreshToken, expiresAt };
}

export async function refresh(presentedToken: string) {
  const tokenHash = hashToken(presentedToken);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.revoked || record.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid refresh token");
  }
  if (!record.user || record.user.deletedAt) {
    throw new UnauthorizedError("User no longer active");
  }

  // Rotate: revoke old, issue new pair
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revoked: true },
  });

  return issueTokens({
    sub: record.user.id,
    email: record.user.email,
    userType: record.user.userType,
  });
}

export async function logout(presentedToken: string) {
  const tokenHash = hashToken(presentedToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revoked: false },
    data: { revoked: true },
  });
  // Touch redis to record logout time (useful for future jti blacklists)
  await redis.set(`logout:${tokenHash}`, "1", "EX", 60 * 60 * 24 * 7);
}
