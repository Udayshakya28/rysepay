import type { Request, Response } from "express";
import { z } from "zod";
import * as fxService from "./service.js";

const RatesQuerySchema = z.object({
  from: z.enum(["INR", "JPY"]),
  to: z.enum(["INR", "JPY"]),
});

const QuoteSchema = z.object({
  from: z.enum(["INR", "JPY"]),
  to: z.enum(["INR", "JPY"]),
  amount: z.number().positive(),
});

export async function getRate(req: Request, res: Response) {
  const params = RatesQuerySchema.parse(req.query);
  const rate = await fxService.getRate(params.from, params.to);
  res.json(rate);
}

export async function createQuote(req: Request, res: Response) {
  const body = QuoteSchema.parse(req.body);
  const quote = await fxService.lockQuote(body);
  res.status(201).json(quote);
}
