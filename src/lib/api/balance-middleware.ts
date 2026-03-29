/**
 * 余额检查中间件
 *
 * Project.balance > 0，否则 402 + 当前余额
 */

import type { Project } from "@prisma/client";
import { errorResponse } from "./errors";
import type { NextResponse } from "next/server";

type BalanceResult =
  | { ok: true }
  | { ok: false; error: NextResponse };

export function checkBalance(project: Project): BalanceResult {
  const balance = Number(project.balance);

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
