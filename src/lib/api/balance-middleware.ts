/**
 * 余额检查中间件
 *
 * User.balance > 0，否则 402 + 当前余额
 */

import { errorResponse } from "./errors";
import type { NextResponse } from "next/server";

interface BalanceHolder {
  balance: number | { toNumber?: () => number } | string;
}

type BalanceResult =
  | { ok: true }
  | { ok: false; error: NextResponse };

export function checkBalance(entity: BalanceHolder): BalanceResult {
  const balance = typeof entity.balance === "object" && entity.balance !== null && "toNumber" in entity.balance
    ? (entity.balance as { toNumber: () => number }).toNumber()
    : Number(entity.balance);

  if (balance <= 0) {
    return {
      ok: false,
      error: errorResponse(
        402,
        "insufficient_balance",
        `Insufficient balance. Current balance: $${balance.toFixed(6)}. Please recharge.`,
        { balance },
      ),
    };
  }

  return { ok: true };
}
