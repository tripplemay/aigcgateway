/**
 * BL-IMAGE-PRICING-OR-P2 F-BIPOR-01 — OpenRouter token-priced image channel 定价。
 *
 * P1 F-BAX-08 修了 30 条 per-call 定价 image channel；本批次补 6 条 OR 的
 * token-priced channel（按 prompt + completion token 计费）。
 *
 * 决策（继承 P1）：USD 口径，sellPrice = costPrice × 1.2。数据源 OR
 * /api/v1/models canonical（apply 前已 curl 复核 drift=0%）。
 *
 * 用法：
 *   npx tsx scripts/pricing/fix-or-image-channels-2026-04-25.ts           # dry-run
 *   npx tsx scripts/pricing/fix-or-image-channels-2026-04-25.ts --apply   # 实际写入
 *
 * 幂等：重跑已 apply 数据 → "no change"。
 */
import { prisma } from "../../src/lib/prisma";
import { disconnectRedis } from "../../src/lib/redis";

export interface OrChannelPriceEntry {
  channelId: string;
  model: string; // OR canonical name
  inputPer1M: number; // USD per 1M prompt tokens
  outputPer1M: number; // USD per 1M completion tokens
}

/** Spec § 3.1 — 6 条 OR image channel 定价。已与 OR /api/v1/models 校对。 */
export const OR_IMAGE_PRICES: readonly OrChannelPriceEntry[] = [
  {
    channelId: "cmnpqumpb008zbnxc2t47ollt",
    model: "google/gemini-2.5-flash-image",
    inputPer1M: 0.3,
    outputPer1M: 2.5,
  },
  {
    channelId: "cmnpqumjc006wbnxceftbpqv3",
    model: "google/gemini-3-pro-image-preview",
    inputPer1M: 2.0,
    outputPer1M: 12.0,
  },
  {
    channelId: "cmnpqum5m002bbnxcr4b4v3ew",
    model: "google/gemini-3.1-flash-image-preview",
    inputPer1M: 0.5,
    outputPer1M: 3.0,
  },
  {
    channelId: "cmnpqumo4008kbnxck2puju4i",
    model: "openai/gpt-5-image",
    inputPer1M: 10.0,
    outputPer1M: 10.0,
  },
  {
    channelId: "cmnpqumn40088bnxcn4z62t2x",
    model: "openai/gpt-5-image-mini",
    inputPer1M: 2.5,
    outputPer1M: 2.0,
  },
  {
    channelId: "cmo9iyi2w0buxbnvxe4c1aaqt",
    model: "openai/gpt-5.4-image-2",
    inputPer1M: 8.0,
    outputPer1M: 15.0,
  },
];

const SELL_MARKUP = 1.2;

interface TokenPrice {
  unit: "token";
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * 比较当前 costPrice 与目标 token 计价 entry（±1e-6 浮点容差，铁律 1.3）。
 * 同时校验 unit + 两个 perMillion 字段。
 */
export function tokenPriceMatches(
  current: unknown,
  expected: TokenPrice,
  tolerance = 1e-6,
): boolean {
  if (!current || typeof current !== "object") return false;
  const c = current as { unit?: unknown; inputPer1M?: unknown; outputPer1M?: unknown };
  if (c.unit !== expected.unit) return false;
  if (typeof c.inputPer1M !== "number" || typeof c.outputPer1M !== "number") return false;
  return (
    Math.abs(c.inputPer1M - expected.inputPer1M) <= tolerance &&
    Math.abs(c.outputPer1M - expected.outputPer1M) <= tolerance
  );
}

interface RunOptions {
  apply: boolean;
}

interface OrChannelDiff {
  channelId: string;
  model: string;
  before: { costPrice: unknown; sellPrice: unknown };
  after: { costPrice: TokenPrice; sellPrice: TokenPrice };
  skipped: boolean;
}

export async function runOrPricingFix(opts: RunOptions): Promise<{
  diffs: OrChannelDiff[];
}> {
  const diffs: OrChannelDiff[] = [];
  for (const entry of OR_IMAGE_PRICES) {
    const ch = await prisma.channel.findUnique({
      where: { id: entry.channelId },
      select: { id: true, costPrice: true, sellPrice: true },
    });
    if (!ch) {
      console.warn(`[missing] channelId=${entry.channelId} (${entry.model}) not in DB — skip`);
      continue;
    }
    const costExpected: TokenPrice = {
      unit: "token",
      inputPer1M: entry.inputPer1M,
      outputPer1M: entry.outputPer1M,
    };
    const sellExpected: TokenPrice = {
      unit: "token",
      inputPer1M: entry.inputPer1M * SELL_MARKUP,
      outputPer1M: entry.outputPer1M * SELL_MARKUP,
    };
    const skipped =
      tokenPriceMatches(ch.costPrice, costExpected) &&
      tokenPriceMatches(ch.sellPrice, sellExpected);
    const diff: OrChannelDiff = {
      channelId: entry.channelId,
      model: entry.model,
      before: { costPrice: ch.costPrice, sellPrice: ch.sellPrice },
      after: { costPrice: costExpected, sellPrice: sellExpected },
      skipped,
    };
    diffs.push(diff);

    if (skipped) {
      console.log(`[no change] ${entry.model} (${entry.channelId})`);
      continue;
    }
    console.log(`[${opts.apply ? "apply " : "dry-run"}] ${entry.model} (${entry.channelId})`);
    console.log(`    costPrice: ${JSON.stringify(ch.costPrice)} → ${JSON.stringify(costExpected)}`);
    console.log(`    sellPrice: ${JSON.stringify(ch.sellPrice)} → ${JSON.stringify(sellExpected)}`);

    if (opts.apply) {
      await prisma.channel.update({
        where: { id: entry.channelId },
        data: { costPrice: costExpected, sellPrice: sellExpected },
      });
    }
  }
  return { diffs };
}

// ============================================================
// CLI entrypoint
// ============================================================

async function cliMain(): Promise<void> {
  const apply = process.argv.slice(2).includes("--apply");
  console.log(`=== F-BIPOR-01 OR image channel pricing fix (${apply ? "APPLY" : "DRY-RUN"}) ===`);
  if (apply) {
    console.log(
      "[hint] make sure you've cross-checked OR /api/v1/models — abort if pricing has drifted >10% since 2026-04-25.",
    );
  }
  const { diffs } = await runOrPricingFix({ apply });
  const changed = diffs.filter((d) => !d.skipped).length;
  console.log(
    `\nSummary: ${diffs.length} channels inspected (${changed} ${apply ? "updated" : "would update"}).`,
  );
  if (!apply) console.log("[hint] re-run with --apply to commit changes.");
  await prisma.$disconnect();
  await disconnectRedis();
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("fix-or-image-channels-2026-04-25.ts");
if (isDirectRun) {
  cliMain().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
