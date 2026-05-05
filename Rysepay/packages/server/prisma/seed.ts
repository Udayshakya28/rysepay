import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed system FX-reserve accounts (one per currency).
  for (const currency of ["INR", "JPY"] as const) {
    await prisma.account.upsert({
      where: { id: deterministicReserveId(currency) },
      update: {},
      create: {
        id: deterministicReserveId(currency),
        accountType: "fx_reserve",
        currency,
        balance: 0,
      },
    });
    await prisma.account.upsert({
      where: { id: deterministicFeeId(currency) },
      update: {},
      create: {
        id: deterministicFeeId(currency),
        accountType: "fee_account",
        currency,
        balance: 0,
      },
    });
  }
}

// Fixed UUIDs so the seed is idempotent.
function deterministicReserveId(currency: "INR" | "JPY"): string {
  return currency === "INR"
    ? "00000000-0000-0000-0000-000000000001"
    : "00000000-0000-0000-0000-000000000002";
}
function deterministicFeeId(currency: "INR" | "JPY"): string {
  return currency === "INR"
    ? "00000000-0000-0000-0000-000000000011"
    : "00000000-0000-0000-0000-000000000012";
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
