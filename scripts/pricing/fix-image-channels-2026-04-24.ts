/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-08 — Image channel pricing 系统性修正（2026-04-24）。
 *
 * 背景：reverifying round1 #11 seedream-3 生产 call_logs.costPrice=0 FAIL，根因
 * 扫描发现 40 条 image channel 全体 costPrice.perCall=0（数据配置层漏洞）。
 * 本脚本：30 条 channel UPDATE + 4 条 model modality 修正。
 *
 * 决策口径：costPrice = 官方原价 USD；sellPrice = costPrice × 1.2。
 * CNY 按 1 USD = 7 CNY 换算。sellPrice 用硬编码值避免 JS 浮点误差。
 *
 * 用法：
 *   npx tsx scripts/pricing/fix-image-channels-2026-04-24.ts           # dry-run 打印 diff
 *   npx tsx scripts/pricing/fix-image-channels-2026-04-24.ts --apply   # 实际 UPDATE
 *
 * 幂等：重跑已 apply 的条目输出 "no change"。
 */
import { prisma } from "../../src/lib/prisma";
import { disconnectRedis } from "../../src/lib/redis";

// ============================================================
// 硬编码定价表（spec § 3.1）
// ============================================================

export interface ChannelPriceEntry {
  channelId: string;
  provider: string;
  model: string;
  costPerCall: number; // USD
  sellPerCall: number; // USD
}

export const IMAGE_CHANNEL_PRICES: readonly ChannelPriceEntry[] = [
  {
    channelId: "cmnpquy5m00rwbnxcc0omrhet",
    provider: "volcengine",
    model: "seedream-3.0",
    costPerCall: 0.037,
    sellPerCall: 0.0444,
  },
  {
    channelId: "cmnpquy5y00rzbnxcxuixo8q8",
    provider: "volcengine",
    model: "seedream-4.0",
    costPerCall: 0.0286,
    sellPerCall: 0.0343,
  },
  {
    channelId: "cmnpquy6c00s2bnxciwqef9po",
    provider: "volcengine",
    model: "seedream-4.5",
    costPerCall: 0.0357,
    sellPerCall: 0.0429,
  },
  {
    channelId: "cmnukegio0039bnsef0msh0bb",
    provider: "qwen",
    model: "qwen-image-2.0",
    costPerCall: 0.0286,
    sellPerCall: 0.0343,
  },
  {
    channelId: "cmnukegh8002wbnsedae7k05n",
    provider: "qwen",
    model: "qwen-image-2.0-2026-03-03",
    costPerCall: 0.0286,
    sellPerCall: 0.0343,
  },
  {
    channelId: "cmnukeghk0031bnsevhekxg4x",
    provider: "qwen",
    model: "qwen-image-2.0-pro",
    costPerCall: 0.0714,
    sellPerCall: 0.0857,
  },
  {
    channelId: "cmnukegi40035bnsegwbx3ueq",
    provider: "qwen",
    model: "qwen-image-2.0-pro-2026-03-03",
    costPerCall: 0.0714,
    sellPerCall: 0.0857,
  },
  {
    channelId: "cmoca6bxz0001bnsmjykljq2k",
    provider: "qwen",
    model: "qwen-image-2.0-pro-2026-04-22",
    costPerCall: 0.0714,
    sellPerCall: 0.0857,
  },
  {
    channelId: "cmnukegrj006pbnse7j3gtb0d",
    provider: "qwen",
    model: "qwen-image-edit-max",
    costPerCall: 0.0714,
    sellPerCall: 0.0857,
  },
  {
    channelId: "cmnukegr8006kbnsen8lptjys",
    provider: "qwen",
    model: "qwen-image-edit-max-2026-01-16",
    costPerCall: 0.0714,
    sellPerCall: 0.0857,
  },
  {
    channelId: "cmnukegya0099bnsefir3brxy",
    provider: "qwen",
    model: "qwen-image-edit-plus",
    costPerCall: 0.0286,
    sellPerCall: 0.0343,
  },
  {
    channelId: "cmnukegxz0095bnsexkx0poni",
    provider: "qwen",
    model: "qwen-image-edit-plus-2025-10-30",
    costPerCall: 0.0286,
    sellPerCall: 0.0343,
  },
  {
    channelId: "cmnukegu2007nbnses5kt4rbd",
    provider: "qwen",
    model: "qwen-image-edit-plus-2025-12-15",
    costPerCall: 0.0286,
    sellPerCall: 0.0343,
  },
  {
    channelId: "cmnukegss0076bnse64juomn7",
    provider: "qwen",
    model: "qwen-image-max",
    costPerCall: 0.0714,
    sellPerCall: 0.0857,
  },
  {
    channelId: "cmnukegsj0072bnsecdbcdwgj",
    provider: "qwen",
    model: "qwen-image-max-2025-12-30",
    costPerCall: 0.0714,
    sellPerCall: 0.0857,
  },
  {
    channelId: "cmnukegrt006tbnse1dnwjede",
    provider: "qwen",
    model: "qwen-image-plus-2026-01-09",
    costPerCall: 0.0286,
    sellPerCall: 0.0343,
  },
  {
    channelId: "cmnukegfk002gbnsewzxcheko",
    provider: "qwen",
    model: "wan2.7-image",
    costPerCall: 0.0286,
    sellPerCall: 0.0343,
  },
  {
    channelId: "cmnukegez0029bnse0d9akksv",
    provider: "qwen",
    model: "wan2.7-image-pro",
    costPerCall: 0.0714,
    sellPerCall: 0.0857,
  },
  {
    channelId: "cmnukegtg007ebnse2ikscfku",
    provider: "qwen",
    model: "z-image-turbo",
    costPerCall: 0.0286,
    sellPerCall: 0.0343,
  },
  {
    channelId: "cmnujtxfs00jmbnrzj2c9t6tp",
    provider: "siliconflow",
    model: "qwen/qwen-image",
    costPerCall: 0.02,
    sellPerCall: 0.024,
  },
  {
    channelId: "cmnujtxfg00jjbnrz0slsyj1j",
    provider: "siliconflow",
    model: "qwen/qwen-image-edit",
    costPerCall: 0.04,
    sellPerCall: 0.048,
  },
  {
    channelId: "cmnujtxf300jgbnrzuj14zlnp",
    provider: "siliconflow",
    model: "qwen/qwen-image-edit-2509",
    costPerCall: 0.04,
    sellPerCall: 0.048,
  },
  {
    channelId: "cmnpqv0mq013sbnxc9vjqcoyz",
    provider: "openai",
    model: "gemini-3-pro-image-preview",
    costPerCall: 0.042,
    sellPerCall: 0.0504,
  },
  {
    channelId: "cmnpqv0m5013mbnxc1qhphm0a",
    provider: "openai",
    model: "gemini-3.1-flash-image-preview",
    costPerCall: 0.042,
    sellPerCall: 0.0504,
  },
  {
    channelId: "cmnpqv0mf013pbnxcysr06pxa",
    provider: "openai",
    model: "gpt-image-1",
    costPerCall: 0.042,
    sellPerCall: 0.0504,
  },
  {
    channelId: "cmnpqv0nd013ybnxcex3iuglj",
    provider: "openai",
    model: "gpt-image-1-mini",
    costPerCall: 0.011,
    sellPerCall: 0.0132,
  },
  {
    channelId: "cmnpqv0n2013vbnxcui7y73rp",
    provider: "openai",
    model: "gpt-image-1.5",
    costPerCall: 0.009,
    sellPerCall: 0.0108,
  },
  {
    channelId: "cmoayey2y0mi7bnvxr667x1z6",
    provider: "openai",
    model: "gpt-image-2",
    costPerCall: 0.042,
    sellPerCall: 0.0504,
  },
  {
    channelId: "cmoayey2x0mi6bnvxmydm6jat",
    provider: "openai",
    model: "gpt-image-2-ca",
    costPerCall: 0.042,
    sellPerCall: 0.0504,
  },
  // BL-IMAGE-PRICING-OR-P2 fix_round 2 addendum (2026-04-26): 3 条 sync 后陆续
  // 新增的 image channel，未在原 P1 spec § 3.1 表中。按 OpenAI/Google canonical
  // 保守填值，让脚本幂等 + sync 后保持非零（buildCostPrice IMAGE→null 修复
  // 已防 sync 覆盖；这里加进硬编码表是为了"已知未填值的运营纠错"路径）。
  {
    channelId: "cmnpqv0lk013gbnxchdxs55ch",
    provider: "openai",
    model: "dall-e-2",
    costPerCall: 0.02,
    sellPerCall: 0.024,
  },
  {
    channelId: "cmnpqv0lb013dbnxcmm6ny1e5",
    provider: "openai",
    model: "dall-e-3",
    costPerCall: 0.04,
    sellPerCall: 0.048,
  },
  {
    channelId: "cmnpqv0lw013jbnxctqm8tyt6",
    provider: "openai",
    model: "gemini-2.5-flash-image-preview",
    costPerCall: 0.042,
    sellPerCall: 0.0504,
  },
  {
    channelId: "cmnujsns900fhbnrzmnf793q2",
    provider: "zhipu",
    model: "cogview-3",
    costPerCall: 0.0357,
    sellPerCall: 0.0429,
  },
];

// ============================================================
// 4 条 model modality 修正（spec § 3.2）— vision 模型是文本输出
// ============================================================

export const MODALITY_FIX_MODELS: readonly string[] = [
  "gpt-4.1-vision",
  "gpt-4o-vision",
  "gpt-4o-mini-vision",
  "glm-4v",
];

// ============================================================
// 幂等比对：判断 current costPrice 是否已是期望值
// ============================================================

export function priceMatches(
  current: unknown,
  expected: { unit: "call"; perCall: number },
  tolerance = 1e-9,
): boolean {
  if (!current || typeof current !== "object") return false;
  const c = current as { unit?: unknown; perCall?: unknown };
  if (c.unit !== expected.unit) return false;
  if (typeof c.perCall !== "number") return false;
  return Math.abs(c.perCall - expected.perCall) <= tolerance;
}

// ============================================================
// 执行
// ============================================================

interface RunOptions {
  apply: boolean;
}

interface ChannelDiff {
  channelId: string;
  model: string;
  provider: string;
  before: { costPrice: unknown; sellPrice: unknown };
  after: {
    costPrice: { unit: "call"; perCall: number };
    sellPrice: { unit: "call"; perCall: number };
  };
  skipped: boolean;
}

export async function runPricingFix(opts: RunOptions): Promise<{
  channelDiffs: ChannelDiff[];
  modalityChanges: Array<{ name: string; before: string; after: string; skipped: boolean }>;
}> {
  const channelDiffs: ChannelDiff[] = [];
  for (const entry of IMAGE_CHANNEL_PRICES) {
    const current = await prisma.channel.findUnique({
      where: { id: entry.channelId },
      select: { id: true, costPrice: true, sellPrice: true },
    });
    if (!current) {
      console.warn(
        `[missing] channelId=${entry.channelId} (${entry.provider}/${entry.model}) not in DB — skip`,
      );
      continue;
    }
    const costExpected = { unit: "call" as const, perCall: entry.costPerCall };
    const sellExpected = { unit: "call" as const, perCall: entry.sellPerCall };
    const alreadyCost = priceMatches(current.costPrice, costExpected);
    const alreadySell = priceMatches(current.sellPrice, sellExpected);
    const skipped = alreadyCost && alreadySell;
    const diff: ChannelDiff = {
      channelId: entry.channelId,
      model: entry.model,
      provider: entry.provider,
      before: { costPrice: current.costPrice, sellPrice: current.sellPrice },
      after: { costPrice: costExpected, sellPrice: sellExpected },
      skipped,
    };
    channelDiffs.push(diff);

    if (skipped) {
      console.log(`[no change] ${entry.provider}/${entry.model} (${entry.channelId})`);
      continue;
    }

    const beforeStr = JSON.stringify(current.costPrice);
    const afterStr = JSON.stringify(costExpected);
    console.log(
      `[${opts.apply ? "apply " : "dry-run"}] ${entry.provider}/${entry.model} (${entry.channelId})`,
    );
    console.log(`    costPrice: ${beforeStr} → ${afterStr}`);
    console.log(
      `    sellPrice: ${JSON.stringify(current.sellPrice)} → ${JSON.stringify(sellExpected)}`,
    );

    if (opts.apply) {
      await prisma.channel.update({
        where: { id: entry.channelId },
        data: { costPrice: costExpected, sellPrice: sellExpected },
      });
    }
  }

  // modality 修正
  const modalityChanges: Array<{ name: string; before: string; after: string; skipped: boolean }> =
    [];
  for (const name of MODALITY_FIX_MODELS) {
    const model = await prisma.model.findUnique({
      where: { name },
      select: { name: true, modality: true },
    });
    if (!model) {
      console.warn(`[missing] model name=${name} not in DB — skip`);
      continue;
    }
    const skipped = model.modality === "TEXT";
    const change = {
      name: model.name,
      before: model.modality,
      after: "TEXT",
      skipped,
    };
    modalityChanges.push(change);

    if (skipped) {
      console.log(`[no change] model ${name} modality already TEXT`);
      continue;
    }
    console.log(
      `[${opts.apply ? "apply " : "dry-run"}] model ${name}: modality ${model.modality} → TEXT`,
    );
    if (opts.apply) {
      await prisma.model.update({ where: { name }, data: { modality: "TEXT" } });
    }
  }

  return { channelDiffs, modalityChanges };
}

// ============================================================
// CLI entrypoint — import-safe（仅直接执行时触发）
// ============================================================

async function cliMain(): Promise<void> {
  const apply = process.argv.slice(2).includes("--apply");
  console.log(`=== F-BAX-08 image channel pricing fix (${apply ? "APPLY" : "DRY-RUN"}) ===`);
  const { channelDiffs, modalityChanges } = await runPricingFix({ apply });
  const changedChannels = channelDiffs.filter((d) => !d.skipped).length;
  const changedModels = modalityChanges.filter((m) => !m.skipped).length;
  console.log(
    `\nSummary: ${channelDiffs.length} channels inspected (${changedChannels} ${apply ? "updated" : "would update"}); ` +
      `${modalityChanges.length} models inspected (${changedModels} ${apply ? "updated" : "would update"}).`,
  );
  if (!apply) {
    console.log("[hint] re-run with --apply to commit changes.");
  }
  await prisma.$disconnect();
  await disconnectRedis();
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("fix-image-channels-2026-04-24.ts");
if (isDirectRun) {
  cliMain().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
