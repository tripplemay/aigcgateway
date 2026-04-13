/**
 * AUDIT-CRITICAL-FIX F-ACF-03 — historical refund audit for zero-image deliveries.
 *
 * Finds CallLog rows that were billed despite delivering zero images (the pre-F-ACF-01
 * bug) and refunds the victims. Runs in dry-run by default.
 *
 * Usage:
 *   npx tsx scripts/refund-zero-image-audit.ts            # dry-run
 *   npx tsx scripts/refund-zero-image-audit.ts --apply    # actually refund
 *
 * Idempotent via transactions.traceId — if a REFUND row already exists with the
 * same traceId as the original CallLog, the record is skipped.
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

interface Victim {
  traceId: string;
  callLogId: string;
  userId: string;
  projectId: string;
  modelName: string;
  sellPrice: Prisma.Decimal;
  createdAt: Date;
}

async function findVictims(): Promise<Victim[]> {
  // IMAGE-modality models where SUCCESS was recorded but images_count is 0 or missing.
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      traceId: string;
      projectId: string;
      modelName: string;
      sellPrice: Prisma.Decimal;
      createdAt: Date;
      userId: string;
    }>
  >`
    SELECT cl.id,
           cl."traceId",
           cl."projectId",
           cl."modelName",
           cl."sellPrice",
           cl."createdAt",
           p."userId"
      FROM "call_logs" cl
      JOIN "projects" p      ON p.id = cl."projectId"
      JOIN "channels" ch     ON ch.id = cl."channelId"
      JOIN "models"   m      ON m.id = ch."modelId"
     WHERE cl.status = 'SUCCESS'
       AND cl."sellPrice" > 0
       AND m.modality = 'IMAGE'
       AND (
             cl."responseSummary" IS NULL
          OR (cl."responseSummary"->>'images_count')::int = 0
       )
     ORDER BY cl."createdAt" ASC
  `;

  return rows.map((r) => ({
    traceId: r.traceId,
    callLogId: r.id,
    userId: r.userId,
    projectId: r.projectId,
    modelName: r.modelName,
    sellPrice: r.sellPrice,
    createdAt: r.createdAt,
  }));
}

async function alreadyRefunded(traceId: string): Promise<boolean> {
  const existing = await prisma.transaction.findFirst({
    where: { traceId, type: "REFUND" },
    select: { id: true },
  });
  return existing !== null;
}

async function refund(v: Victim): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const dup = await tx.transaction.findFirst({
      where: { traceId: v.traceId, type: "REFUND" },
      select: { id: true },
    });
    if (dup) return;

    const user = await tx.user.update({
      where: { id: v.userId },
      data: { balance: { increment: v.sellPrice } },
      select: { balance: true },
    });

    await tx.transaction.create({
      data: {
        projectId: v.projectId,
        userId: v.userId,
        type: "REFUND",
        amount: v.sellPrice,
        balanceAfter: user.balance,
        status: "COMPLETED",
        callLogId: v.callLogId,
        traceId: v.traceId,
        description: `Zero image delivery refund (${v.modelName})`,
      },
    });
  });
}

async function main(): Promise<void> {
  console.log(`[refund-zero-image-audit] mode=${APPLY ? "APPLY" : "dry-run"}`);

  const victims = await findVictims();
  console.log(`Found ${victims.length} candidate zero-image SUCCESS call logs.`);

  if (victims.length === 0) return;

  const byUser = new Map<string, { total: Prisma.Decimal; count: number }>();
  for (const v of victims) {
    const entry = byUser.get(v.userId) ?? { total: new Prisma.Decimal(0), count: 0 };
    entry.total = entry.total.plus(v.sellPrice);
    entry.count += 1;
    byUser.set(v.userId, entry);
  }

  console.log("\nPer-user rollup:");
  for (const [userId, e] of byUser) {
    console.log(`  user=${userId}  count=${e.count}  refund_usd=${e.total.toString()}`);
  }

  if (!APPLY) {
    console.log("\nDry-run only. Pass --apply to write refunds.");
    return;
  }

  let refunded = 0;
  let skipped = 0;
  for (const v of victims) {
    if (await alreadyRefunded(v.traceId)) {
      skipped += 1;
      continue;
    }
    await refund(v);
    refunded += 1;
  }
  console.log(`\nApply complete. refunded=${refunded} skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error("[refund-zero-image-audit] error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
