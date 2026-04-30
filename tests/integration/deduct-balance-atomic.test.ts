/**
 * BL-TEST-INFRA-IMPORT F-TI-05 — first Testcontainers integration test.
 *
 * Validates the atomicity contract of the `deduct_balance(...)` PG
 * function (defined in 20260418_deduct_balance_for_update). Two
 * concurrent deductions of $8 against a $10 balance must serialize
 * via the explicit `SELECT ... FOR UPDATE` lock so that:
 *   - exactly one call succeeds,
 *   - the other rejects with 'Insufficient balance',
 *   - the final balance is non-negative,
 *   - the transactions table records exactly one DEDUCTION row.
 *
 * Why integration: the safety guarantee is a property of the SQL
 * function under real PostgreSQL row-level locking. A unit test with
 * mocked Prisma cannot prove FOR UPDATE actually serializes — only a
 * real DB can.
 *
 * Boot cost: container start ~5-15s + `prisma migrate deploy` ~10-25s.
 * Per-test work runs in ~50ms.
 */
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { setupTestDb, teardownTestDb, truncateAll } from "../helpers/db";

let prisma: PrismaClient;

beforeAll(async () => {
  ({ prisma } = await setupTestDb());
}, 180_000);

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

async function seedUserWithBalance(
  balance: number,
): Promise<{ userId: string; projectId: string }> {
  const user = await prisma.user.create({
    data: {
      email: `concurrent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      passwordHash: "x".repeat(60),
      balance: balance.toString(),
    },
  });
  const project = await prisma.project.create({
    data: { userId: user.id, name: "concurrent-test" },
  });
  return { userId: user.id, projectId: project.id };
}

async function callDeductBalance(
  userId: string,
  projectId: string,
  amount: number,
): Promise<{ ok: true; newBalance: string } | { ok: false; error: string }> {
  try {
    const rows = await prisma.$queryRaw<Array<{ new_balance: string }>>`
      SELECT new_balance::TEXT FROM deduct_balance(
        ${userId}::TEXT,
        ${projectId}::TEXT,
        ${amount}::DECIMAL(16,8),
        ${"call-" + Math.random().toString(36).slice(2, 10)}::TEXT,
        ${"integration-test"}::TEXT,
        ${null}::TEXT
      )
    `;
    return { ok: true, newBalance: rows[0]?.new_balance ?? "?" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

describe("deduct_balance — atomicity under concurrent calls", () => {
  it("two concurrent deductions of $8 against $10 balance: only one succeeds, balance non-negative, one DEDUCTION row written", async () => {
    const { userId, projectId } = await seedUserWithBalance(10);

    const [a, b] = await Promise.all([
      callDeductBalance(userId, projectId, 8),
      callDeductBalance(userId, projectId, 8),
    ]);

    const successes = [a, b].filter((r): r is { ok: true; newBalance: string } => r.ok);
    const failures = [a, b].filter((r): r is { ok: false; error: string } => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toMatch(/Insufficient balance/i);

    const finalUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(finalUser).not.toBeNull();
    const finalBalance = Number(finalUser!.balance);
    expect(finalBalance).toBeGreaterThanOrEqual(0);
    expect(finalBalance).toBe(2);

    const txns = await prisma.transaction.findMany({
      where: { userId, type: "DEDUCTION" },
    });
    expect(txns).toHaveLength(1);
    expect(Number(txns[0].amount)).toBe(-8);
    expect(Number(txns[0].balanceAfter)).toBe(2);
  });

  it("three concurrent deductions of $4 against $10 balance: two succeed, one rejects, balance >= 0, two DEDUCTION rows", async () => {
    const { userId, projectId } = await seedUserWithBalance(10);

    const results = await Promise.all([
      callDeductBalance(userId, projectId, 4),
      callDeductBalance(userId, projectId, 4),
      callDeductBalance(userId, projectId, 4),
    ]);

    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);

    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(1);

    const finalUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(Number(finalUser!.balance)).toBe(2);

    const txns = await prisma.transaction.findMany({
      where: { userId, type: "DEDUCTION" },
    });
    expect(txns).toHaveLength(2);
  });
});
