/**
 * BILLING-REFACTOR 数据迁移脚本
 *
 * 确保所有 enabled alias 有完整的 sellPrice（含 unit）。
 *
 * 规则：
 * 1. alias.sellPrice 为空的 → 从关联 channel 最高优先级回填
 * 2. sellPrice 缺 unit 的 → 自动补全（有 inputPer1M→token，有 perCall→call）
 * 3. pricing 数值 round 到 6 位小数消除浮点尾噪
 *
 * 用法：npx tsx prisma/migrations/20260412_billing_refactor_channel_cleanup/backfill-alias-sell-price.ts
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

interface SellPrice {
  inputPer1M?: number;
  outputPer1M?: number;
  perCall?: number;
  unit?: string;
}

function roundTo6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function normalizeSellPrice(sp: SellPrice): SellPrice {
  const result: SellPrice = { ...sp };

  // Infer unit
  if (!result.unit) {
    if (result.inputPer1M !== undefined || result.outputPer1M !== undefined) {
      result.unit = "token";
    } else if (result.perCall !== undefined) {
      result.unit = "call";
    }
  }

  // Round values to 6 decimal places
  if (result.inputPer1M !== undefined) result.inputPer1M = roundTo6(result.inputPer1M);
  if (result.outputPer1M !== undefined) result.outputPer1M = roundTo6(result.outputPer1M);
  if (result.perCall !== undefined) result.perCall = roundTo6(result.perCall);

  return result;
}

async function main() {
  console.log("[backfill] Starting alias sellPrice backfill...\n");

  const aliases = await prisma.modelAlias.findMany({
    where: { enabled: true },
    include: {
      models: {
        include: {
          model: {
            include: {
              channels: {
                where: { status: "ACTIVE" },
                orderBy: { priority: "asc" },
                select: {
                  sellPrice: true,
                  costPrice: true,
                  priority: true,
                },
              },
            },
          },
        },
      },
    },
  });

  let backfilledCount = 0;
  let normalizedCount = 0;
  let alreadyOkCount = 0;

  for (const alias of aliases) {
    const existingSp = alias.sellPrice as SellPrice | null;

    if (existingSp && Object.keys(existingSp).length > 0) {
      // Has sellPrice — check if it needs normalization (missing unit or floating point noise)
      const normalized = normalizeSellPrice(existingSp);
      const changed = JSON.stringify(normalized) !== JSON.stringify(existingSp);

      if (changed) {
        await prisma.modelAlias.update({
          where: { id: alias.id },
          data: { sellPrice: normalized as unknown as Prisma.InputJsonValue },
        });
        console.log(
          `  NORMALIZED ${alias.alias}: ${JSON.stringify(existingSp)} → ${JSON.stringify(normalized)}`,
        );
        normalizedCount++;
      } else {
        alreadyOkCount++;
      }
      continue;
    }

    // sellPrice is empty — backfill from best channel
    const allChannels = alias.models
      .flatMap((link) => link.model.channels)
      .sort((a, b) => a.priority - b.priority);

    const bestChannel = allChannels[0];
    if (!bestChannel) {
      console.log(`  SKIP ${alias.alias}: no active channels`);
      continue;
    }

    // Try channel sellPrice first, then costPrice as last resort
    const channelSp = bestChannel.sellPrice as SellPrice | null;
    const channelCp = bestChannel.costPrice as SellPrice | null;
    const source = channelSp && Object.keys(channelSp).length > 0 ? channelSp : channelCp;

    if (!source || Object.keys(source).length === 0) {
      console.log(`  SKIP ${alias.alias}: no pricing data in channels`);
      continue;
    }

    const normalized = normalizeSellPrice(source);

    await prisma.modelAlias.update({
      where: { id: alias.id },
      data: { sellPrice: normalized as unknown as Prisma.InputJsonValue },
    });
    console.log(`  BACKFILLED ${alias.alias}: ${JSON.stringify(normalized)}`);
    backfilledCount++;
  }

  // Verification
  const missingCount = await prisma.modelAlias.count({
    where: {
      enabled: true,
      OR: [
        { sellPrice: { equals: Prisma.DbNull } },
        { sellPrice: { equals: Prisma.JsonNull } },
        { sellPrice: { equals: {} } },
      ],
    },
  });

  console.log(`\n[backfill] Done!`);
  console.log(`  Backfilled: ${backfilledCount}`);
  console.log(`  Normalized: ${normalizedCount}`);
  console.log(`  Already OK: ${alreadyOkCount}`);
  console.log(`  Still missing: ${missingCount}`);

  if (missingCount > 0) {
    console.warn(`\n  WARNING: ${missingCount} enabled aliases still have no sellPrice!`);
  } else {
    console.log(`\n  ✓ 100% enabled aliases have complete sellPrice`);
  }
}

main()
  .catch((err) => {
    console.error("[backfill] FATAL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
