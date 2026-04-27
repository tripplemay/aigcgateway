/**
 * BL-RECON-FIX-PHASE1 F-RF-03 — Image pricing audit（read-only）。
 *
 * 目的：列出所有 modality=IMAGE 的 Model 及其 Channel 的 costPrice 配置 +
 * 30 天 call_logs 实际消费数据，标注「⚠️ image 模型按 token 计费」可疑组合。
 *
 * 用户基于此报告决定 Phase 2 是否要把可疑 channel.costPrice 从 {unit:'token'}
 * 翻成 {perCall:N}。
 *
 * 用法：
 *   # 本地（数据少时输出可能为空）
 *   npx tsx scripts/audit-image-pricing.ts > docs/audits/image-pricing-YYYY-MM-DD.md
 *
 *   # 生产 read-only
 *   DATABASE_URL=postgresql://... npx tsx scripts/audit-image-pricing.ts \
 *     > docs/audits/image-pricing-YYYY-MM-DD.md
 *
 * 安全性：脚本只调 prisma findMany / aggregate / findUnique 等只读 API；
 * 不存在 INSERT / UPDATE / DELETE / executeRaw / $queryRawUnsafe 等写路径。
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

interface CostPriceConfig {
  unit?: string;
  perCall?: number;
  inputPer1M?: number;
  outputPer1M?: number;
  [key: string]: unknown;
}

function isCostPriceObject(value: unknown): value is CostPriceConfig {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function summarizeCostPrice(costPrice: unknown): { text: string; unit: string | null } {
  if (!isCostPriceObject(costPrice)) {
    return { text: typeof costPrice === "string" ? costPrice : "—", unit: null };
  }
  const unit = typeof costPrice.unit === "string" ? costPrice.unit : null;
  const parts: string[] = [];
  if (unit) parts.push(`unit:'${unit}'`);
  if (typeof costPrice.perCall === "number") parts.push(`perCall:${costPrice.perCall}`);
  if (typeof costPrice.inputPer1M === "number") parts.push(`in/1M:${costPrice.inputPer1M}`);
  if (typeof costPrice.outputPer1M === "number") parts.push(`out/1M:${costPrice.outputPer1M}`);
  return { text: parts.length > 0 ? `{${parts.join(", ")}}` : "—", unit };
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(4)}`;
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, "\\|");
}

async function main(): Promise<void> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1) 拉所有 image modality 的 model + channel + provider
  const models = await prisma.model.findMany({
    where: { modality: "IMAGE" },
    include: {
      channels: {
        include: { provider: { select: { name: true } } },
        orderBy: { priority: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  let suspectChannelCount = 0;
  let perCallChannelCount = 0;
  let otherChannelCount = 0;
  for (const m of models) {
    for (const ch of m.channels) {
      const cp = isCostPriceObject(ch.costPrice) ? ch.costPrice : null;
      const unit = cp && typeof cp.unit === "string" ? cp.unit : null;
      const hasPerCall = cp && typeof cp.perCall === "number";
      if (unit === "token") suspectChannelCount += 1;
      else if (hasPerCall) perCallChannelCount += 1;
      else otherChannelCount += 1;
    }
  }

  // 2) 输出 markdown 报告（write-to-stdout，调用方重定向到文件）
  const reportDate = now.toISOString().slice(0, 10);
  console.log(`# Image Pricing Audit (${reportDate})`);
  console.log();
  console.log(
    "BL-RECON-FIX-PHASE1 F-RF-03 — read-only audit of image-modality models and their channel cost configurations.",
  );
  console.log();
  console.log("## Summary");
  console.log();
  console.log(`- Image modality models: **${models.length}**`);
  console.log(
    `- Channels using token-priced costPrice (⚠️ suspect for image modality): **${suspectChannelCount}**`,
  );
  console.log(`- Channels using perCall costPrice (reasonable): **${perCallChannelCount}**`);
  console.log(`- Channels with other / unknown costPrice shape: **${otherChannelCount}**`);
  console.log();
  console.log(
    `Window for 30-day call_logs aggregates: \`${thirtyDaysAgo.toISOString()}\` → \`${now.toISOString()}\``,
  );
  console.log();
  console.log(
    "⚠️ marker means: modality=IMAGE AND channel.costPrice.unit==='token'. Image models charged by token may undercount when upstream bills per-call (e.g. openrouter image models).",
  );
  console.log();

  if (models.length === 0) {
    console.log("## Per-Model Breakdown");
    console.log();
    console.log("_No image-modality models in this database._");
    return;
  }

  console.log("## Per-Model Breakdown");
  console.log();
  for (const m of models) {
    console.log(`### \`${m.name}\` (${m.displayName})`);
    console.log();
    console.log(`- Modality: \`${m.modality}\``);
    console.log(`- Enabled: \`${m.enabled}\``);
    console.log(`- Channels: ${m.channels.length}`);
    console.log();

    if (m.channels.length === 0) {
      console.log("_No channels._");
      console.log();
      continue;
    }

    console.log(
      "| Provider | Channel ID | costPrice | sellPrice | Status | Marker |",
    );
    console.log("|---|---|---|---|---|---|");
    for (const ch of m.channels) {
      const costSummary = summarizeCostPrice(ch.costPrice);
      const sellSummary = summarizeCostPrice(ch.sellPrice);
      const isSuspect = costSummary.unit === "token";
      const marker = isSuspect ? "⚠️ token-priced image" : "—";
      console.log(
        `| ${escapePipe(ch.provider.name)} | \`${ch.id}\` | \`${escapePipe(costSummary.text)}\` | \`${escapePipe(sellSummary.text)}\` | ${ch.status} | ${marker} |`,
      );
    }
    console.log();

    // 30 天 call_logs 聚合：sum(costPrice), sum(sellPrice), count
    const agg = await prisma.callLog.aggregate({
      where: {
        modelName: m.name,
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: { _all: true },
      _sum: { costPrice: true, sellPrice: true },
    });

    const total = agg._count._all;
    const sumCost = agg._sum.costPrice instanceof Prisma.Decimal
      ? Number(agg._sum.costPrice)
      : (agg._sum.costPrice ?? 0);
    const sumSell = agg._sum.sellPrice instanceof Prisma.Decimal
      ? Number(agg._sum.sellPrice)
      : (agg._sum.sellPrice ?? 0);
    const avgCost = total > 0 ? sumCost / total : 0;
    const avgSell = total > 0 ? sumSell / total : 0;

    console.log("**30-day call_logs:**");
    console.log();
    console.log(`- Total calls: \`${total}\``);
    console.log(`- Sum costPrice: \`${formatUsd(sumCost)}\``);
    console.log(`- Sum sellPrice: \`${formatUsd(sumSell)}\``);
    console.log(`- Avg costPrice/call: \`${formatUsd(avgCost)}\``);
    console.log(`- Avg sellPrice/call: \`${formatUsd(avgSell)}\``);
    console.log();
  }

  console.log("---");
  console.log();
  console.log("## Notes");
  console.log();
  console.log(
    "- This script is **read-only**: it only invokes `prisma.*.findMany / aggregate`.",
  );
  console.log(
    "- Phase 2 decision: review each ⚠️ row and confirm whether the upstream provider charges per-call (translate to `{perCall:N}`) or actually charges by token (no change required).",
  );
  console.log(
    "- Sources of truth for upstream pricing:",
  );
  console.log(
    "  - openrouter: https://openrouter.ai/models — shows per-image price for image-via-chat models",
  );
  console.log("  - volcengine ark: per-resolution flat fee (configured via SystemConfig)");
  console.log("  - chatanywhere / siliconflow: provider docs");
}

main()
  .catch((err) => {
    console.error("[audit-image-pricing] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
