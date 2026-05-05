import { PrismaClient } from "@prisma/client";
import { isProduction } from "../config/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma__ ??
  new PrismaClient({
    log: isProduction ? ["error"] : ["warn", "error"],
  });

if (!isProduction) globalThis.__prisma__ = prisma;
