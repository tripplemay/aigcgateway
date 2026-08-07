/**
 * BL-BILLING-ZERO-PRICE-BACKFILL F-BZP-02 — 给 `gpt-5.5` / `gpt-5.4` 别名补 sellPrice。
 *
 * ## 修的是什么
 *
 * 全库启用别名中只有这两个缺 `sellPrice`，而它们都有 ACTIVE 通道，正在真实服务：
 *
 *   gpt-5.5  guangtech/gpt-5.5  sell (NULL)   ← 两条通道卖价全空
 *   gpt-5.5  openai/gpt-5.5     sell (NULL)      → sellUsd 恒为 0，**完全免费**
 *   gpt-5.4  guangtech/gpt-5.4  sell (NULL)   ← 走这条白送
 *   gpt-5.4  openai/gpt-5.4     sell {3,18}   ← 走这条正常收费
 *
 * `calculateTokenCost` 取卖价的顺序是 alias.sellPrice → channel.sellPrice，且要求
 * 来源含 token 字段。两者都取不到时退化为 `{}`，`?? 0` 保护下 sellUsd=0 —— 不报错、
 * 不告警，静静地白送。
 *
 * `gpt-5.5` 已因此漏掉 106 次调用、上游成本 $0.957505。
 * `gpt-5.4` 更隐蔽：两条通道 priority 同为 10，选哪条取决于健康状态与冷却，
 * 于是**同一个模型时而收费时而免费**，报表上几乎不可能发现。
 *
 * ## 定价（spec D4，用户裁决）
 *
 * 加价率 **1.1×**（用户明确选择，低于本项目全局 1.2× 惯例），基准为 openrouter 成本：
 *
 *   gpt-5.5  cost {5, 30}    → sell {5.5, 33}
 *   gpt-5.4  cost {2.5, 15}  → sell {2.75, 16.5}
 *
 * ⚠️ **两个用户可感知的后果，用户已知悉并选择：**
 *   1. `gpt-5.5` 由**免费转为收费**。
 *   2. `gpt-5.4` 走 openrouter 通道时现按 1.2×（`{3,18}`）收费；别名层卖价**优先于**
 *      通道层，写入 1.1× 后对现有付费用户构成**降价**（18 → 16.5）。
 *
 * ## 用法
 *
 *   npx tsx scripts/pricing/set-gpt5x-alias-sell-price.ts            # dry-run
 *   npx tsx scripts/pricing/set-gpt5x-alias-sell-price.ts --apply    # 写库 + 回滚清单
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { disconnectRedis } from "../../src/lib/redis";

const PRICING_DIR = "docs/pricing";

/** 用户裁决的加价率（spec D4）。全局惯例是 1.2，此处按用户要求下调。 */
export const SELL_MARKUP = 1.1;

/** openrouter 参考成本（per 1M USD），来自 2026-08-07 价目表快照 */
export const OR_COST: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "gpt-5.5": { inputPer1M: 5, outputPer1M: 30 },
  "gpt-5.4": { inputPer1M: 2.5, outputPer1M: 15 },
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function sellPriceFor(alias: string): {
  unit: "token";
  inputPer1M: number;
  outputPer1M: number;
} {
  const c = OR_COST[alias];
  if (!c) throw new Error(`no reference cost for alias ${alias}`);
  return {
    unit: "token",
    inputPer1M: round6(c.inputPer1M * SELL_MARKUP),
    outputPer1M: round6(c.outputPer1M * SELL_MARKUP),
  };
}

export interface AliasSellResult {
  alias: string;
  before: unknown;
  after: unknown;
  action: "updated" | "skipped";
  reason?: string;
}

export async function setGpt5xAliasSellPrice(
  prisma: PrismaClient,
  opts: { dryRun?: boolean; stamp?: string } = {},
): Promise<AliasSellResult[]> {
  const dryRun = opts.dryRun ?? true;
  const results: AliasSellResult[] = [];

  for (const alias of Object.keys(OR_COST)) {
    const row = await prisma.modelAlias.findUnique({
      where: { alias },
      select: { id: true, sellPrice: true, enabled: true, modality: true },
    });
    if (!row) {
      results.push({ alias, before: null, after: null, action: "skipped", reason: "alias_missing" });
      continue;
    }
    const after = sellPriceFor(alias);
    results.push({ alias, before: row.sellPrice, after, action: "updated" });

    if (!dryRun) {
      // 只写 sellPrice —— enabled / modality 一律不动（spec F-BZP-02 acceptance 2）
      await prisma.modelAlias.update({ where: { alias }, data: { sellPrice: after } });
    }
  }

  if (!dryRun) {
    const stamp = opts.stamp ?? "manual";
    writeFileSync(
      join(PRICING_DIR, `alias-sellprice-rollback-${stamp}.json`),
      JSON.stringify(
        results.filter((r) => r.action === "updated").map((r) => ({
          alias: r.alias,
          originalSellPrice: r.before,
        })),
        null,
        2,
      ),
    );
  }

  return results;
}

// ----------------------------------------------------------------
// CLI
// ----------------------------------------------------------------

async function snapshot(prisma: PrismaClient, label: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ alias: string; aliasSell: string; provider: string; model: string; chCost: string; chSell: string }>
  >(`
    SELECT a.alias, COALESCE(a."sellPrice"::text,'NULL') AS "aliasSell",
           p.name AS provider, m.name AS model,
           COALESCE(c."costPrice"::text,'NULL') AS "chCost",
           COALESCE(c."sellPrice"::text,'NULL') AS "chSell"
    FROM model_aliases a
    JOIN alias_model_links l ON l."aliasId" = a.id
    JOIN models m ON m.id = l."modelId"
    JOIN channels c ON c."modelId" = m.id
    JOIN providers p ON p.id = c."providerId"
    WHERE a.alias IN ('gpt-5.5','gpt-5.4') AND c.status='ACTIVE'
    ORDER BY a.alias, p.name
  `);
  console.log(`--- ${label} ---`);
  for (const r of rows) {
    console.log(
      `  ${r.alias.padEnd(8)} ${r.provider.padEnd(11)} ${r.model.padEnd(20)}` +
        ` alias_sell=${r.aliasSell.padEnd(56)} ch_cost=${r.chCost}`,
    );
  }
}

async function cli(): Promise<void> {
  const apply = process.argv.includes("--apply") || process.env.APPLY === "1";
  const stamp = process.env.STAMP ?? new Date().toISOString().slice(0, 10);
  const prisma = new PrismaClient();

  try {
    console.log(
      apply
        ? `[APPLY] 写入 gpt-5.5 / gpt-5.4 别名卖价（加价率 ${SELL_MARKUP}x）...`
        : `[DRY RUN] 不写库；加价率 ${SELL_MARKUP}x。加 --apply 真正写入。`,
    );
    console.log();
    await snapshot(prisma, "执行前");
    console.log();

    const results = await setGpt5xAliasSellPrice(prisma, { dryRun: !apply, stamp });
    for (const r of results) {
      console.log(
        `  ${r.alias}: ${r.action}` +
          (r.reason ? ` (${r.reason})` : "") +
          ` ${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`,
      );
    }

    if (apply) {
      console.log();
      await snapshot(prisma, "执行后");
      console.log();
      console.log(`回滚清单：${PRICING_DIR}/alias-sellprice-rollback-${stamp}.json`);
      console.log(
        "⚠️ gpt-5.5 由免费转为收费；gpt-5.4 对现有付费用户构成降价（通道层 1.2x → 别名层 1.1x）。",
      );
    }
  } finally {
    await prisma.$disconnect();
    await disconnectRedis().catch(() => {});
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /set-gpt5x-alias-sell-price\.ts$/.test(process.argv[1]);

if (isDirectRun) {
  cli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
