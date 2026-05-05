// Double-entry bookkeeping.
//
// Every transaction MUST be recorded as a balanced set of entries:
// total debits (per currency) === total credits (per currency).
// All entries are written in a single DB transaction so we can't end up with
// half-recorded state.

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import type { Currency, AccountType } from "@ryse/shared/types";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";

export interface LedgerLeg {
  accountId: string;
  entryType: "debit" | "credit";
  amount: Prisma.Decimal | number;
  currency: Currency;
}

type Tx = PrismaClient | Prisma.TransactionClient;

export async function postEntries(
  transactionId: string,
  legs: LedgerLeg[],
  tx?: Tx,
): Promise<void> {
  if (legs.length < 2) throw new ValidationError("ledger needs at least 2 legs");

  // Group by currency, ensure debits == credits per currency.
  const byCurrency = new Map<Currency, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const leg of legs) {
    const amt = leg.amount instanceof Prisma.Decimal ? leg.amount : new Prisma.Decimal(leg.amount);
    if (amt.lte(0)) throw new ValidationError("ledger leg amount must be positive");
    const slot = byCurrency.get(leg.currency) ?? {
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(0),
    };
    if (leg.entryType === "debit") slot.debit = slot.debit.add(amt);
    else slot.credit = slot.credit.add(amt);
    byCurrency.set(leg.currency, slot);
  }
  for (const [currency, sums] of byCurrency) {
    if (!sums.debit.eq(sums.credit)) {
      throw new ValidationError(
        `ledger imbalanced for ${currency}: debit=${sums.debit.toString()}, credit=${sums.credit.toString()}`,
      );
    }
  }

  const work = async (client: Tx) => {
    for (const leg of legs) {
      const account = await client.account.findUniqueOrThrow({ where: { id: leg.accountId } });
      if (account.currency !== leg.currency) {
        throw new ConflictError(
          `account ${leg.accountId} is ${account.currency}, leg is ${leg.currency}`,
        );
      }
      if (account.frozen) throw new ConflictError(`account ${leg.accountId} is frozen`);

      const amt = leg.amount instanceof Prisma.Decimal ? leg.amount : new Prisma.Decimal(leg.amount);
      const delta = leg.entryType === "credit" ? amt : amt.neg();
      const newBalance = account.balance.add(delta);

      // Permitted negative balances depend on account type. For user wallets we
      // forbid going negative; for fx_reserve we allow (we settle the float).
      if (newBalance.isNegative() && account.accountType === "user_wallet") {
        throw new ConflictError(`account ${leg.accountId} would go negative`);
      }

      await client.account.update({
        where: { id: account.id },
        data: { balance: newBalance },
      });
      await client.ledgerEntry.create({
        data: {
          transactionId,
          accountId: account.id,
          entryType: leg.entryType,
          amount: amt,
          currency: leg.currency,
          balanceAfter: newBalance,
        },
      });
    }
  };

  if (tx) await work(tx);
  else await prisma.$transaction((client) => work(client));
}

export async function getOrCreateSystemAccount(
  accountType: AccountType,
  currency: Currency,
  tx?: Tx,
): Promise<string> {
  const runner = tx ?? prisma;
  const existing = await runner.account.findFirst({
    where: { accountType, currency, userId: null, merchantId: null },
  });
  if (existing) return existing.id;
  const created = await runner.account.create({
    data: { accountType, currency },
  });
  return created.id;
}

export async function getOrCreateMerchantSettlementAccount(
  merchantId: string,
  currency: Currency,
  tx?: Tx,
): Promise<string> {
  const runner = tx ?? prisma;
  const existing = await runner.account.findFirst({
    where: { merchantId, accountType: "merchant_settlement", currency },
  });
  if (existing) return existing.id;
  const created = await runner.account.create({
    data: { merchantId, accountType: "merchant_settlement", currency },
  });
  return created.id;
}

export async function getAccountBalance(accountId: string): Promise<Prisma.Decimal> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new NotFoundError("account not found");
  return account.balance;
}
