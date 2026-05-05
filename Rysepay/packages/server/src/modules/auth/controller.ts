import type { Request, Response } from "express";
import { z } from "zod";
import { ValidationError } from "../../utils/errors.js";
import * as authService from "./service.js";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
  userType: z.enum(["consumer", "merchant"]).default("consumer"),
  countryCode: z.enum(["IN", "JP"]),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function register(req: Request, res: Response) {
  const body = RegisterSchema.parse(req.body);
  const user = await authService.register(body);
  res.status(201).json({ user });
}

export async function login(req: Request, res: Response) {
  const body = LoginSchema.parse(req.body);
  const result = await authService.login(body.email, body.password);
  res.json(result);
}

export async function refresh(req: Request, res: Response) {
  const body = RefreshSchema.parse(req.body);
  const tokens = await authService.refresh(body.refreshToken);
  res.json(tokens);
}

export async function logout(req: Request, res: Response) {
  const body = RefreshSchema.parse(req.body);
  if (!body.refreshToken) throw new ValidationError("refreshToken required");
  await authService.logout(body.refreshToken);
  res.status(204).end();
}
