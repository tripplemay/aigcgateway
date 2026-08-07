/**
 * BL-BILLING-ZERO-PRICE-BACKFILL F-BZP-01 — 用 openrouter 价目表回填零成本通道。
 *
 * ## 背景
 *
 * 生产 274 条 ACTIVE 通道 `costPrice` 三字段全为 0（`model-sync.ts` 头注释第 4 条：
 * 「全都没有 → costPrice = 0」，即 sync 拿不到官方价时填 0 占位）。后果是成本侧
 * 一片空白，毛利与对账全不可用。
 *
 * 其中仅 **45 条挂在启用别名上**——BL-SEC-HOTFIX-2608 的 F-SH-03 移除了
 * `routeByModelName` 回退后，没有启用别名的通道根本不可路由，其 costPrice 是死数据。
 * 但既然能匹配到价，休眠的也一并补上，将来启用别名时成本已就位。
 *
 * ## 硬性约束
 *
 * **本脚本一律不触碰任何 sellPrice。** 定价脚本误伤用户账单的代价远高于成本数据不准，
 * 所以卖价变更全部集中在 F-BZP-02，且只针对明确的两个别名。
 *
 * ## 用法
 *
 *   # dry-run（默认，不写库，打印将回填/跳过的完整清单）
 *   npx tsx scripts/pricing/backfill-zero-cost-channels.ts
 *
 *   # 写库（同时生成回滚清单）
 *   npx tsx scripts/pricing/backfill-zero-cost-channels.ts --apply
 *
 *   # 只处理指定通道
 *   npx tsx scripts/pricing/backfill-zero-cost-channels.ts --apply --only=<channelId>,<channelId>
 *
 *   # 指定快照（默认读 docs/pricing/ 下最新的 openrouter-snapshot-*.json）
 *   SNAPSHOT=docs/pricing/openrouter-snapshot-2026-08-07.json npx tsx ...
 *
 * ## 口径（spec D2）
 *
 * openrouter 是转售平台，价里含它自己的渠道费，而 qwen / siliconflow / deepseek
 * 直连通常更便宜。故回填出的 costPrice 是**参考值且系统性偏高**，毛利报表会偏悲观。
 * 不影响用户扣费。拿到各家真实费率后可逐条覆盖。
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { disconnectRedis } from "../../src/lib/redis";
import { buildIndex, matchPrice, type OpenRouterModel, type SkipReason } from "./openrouter-price-match";

const PRICING_DIR = "docs/pricing";

interface ZeroCostChannel {
  channelId: string;
  provider: string;
  modelName: string;
  realModelId: string;
  enabledAliases: string[];
  originalCostPrice: unknown;
}

export interface BackfillPlanRow {
  channel: ZeroCostChannel;
  openRouterId: string;
  inputPer1M: number;
  outputPer1M: number;
}

export interface BackfillSkipRow {
  channel: ZeroCostChannel;
  reason: SkipReason;
  candidates?: string[];
}

export interface BackfillResult {
  plan: BackfillPlanRow[];
  skipped: BackfillSkipRow[];
  applied: number;
  rollbackFile?: string;
}

function loadSnapshot(): OpenRouterModel[] {
  const explicit = process.env.SNAPSHOT;
  const path =
    explicit ??
    join(
      PRICING_DIR,
      readdirSync(PRICING_DIR)
        .filter((f) => /^openrouter-snapshot-.*\.json$/.test(f))
        .sort()
        .pop() ?? "",
    );
  const raw = JSON.parse(readFileSync(path, "utf8")) as { data?: OpenRouterModel[] };
  const models = raw.data ?? [];
  console.log(`价目表快照：${path}（${models.length} 个模型）`);
  return models;
}

async function loadZeroCostChannels(
  prisma: PrismaClient,
  only?: string[],
): Promise<ZeroCostChannel[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      channelId: string;
      provider: string;
      modelName: string;
      realModelId: string;
      aliases: string | null;
      costPrice: unknown;
    }>
  >(`
    SELECT c.id                AS "channelId",
           p.name              AS provider,
           m.name              AS "modelName",
           c."realModelId"     AS "realModelId",
           c."costPrice"       AS "costPrice",
           (SELECT string_agg(a.alias, ',')
              FROM alias_model_links l JOIN model_aliases a ON a.id = l."aliasId"
             WHERE l."modelId" = m.id AND a.enabled) AS aliases
    FROM channels c
    JOIN providers p ON p.id = c."providerId"
    JOIN models    m ON m.id = c."modelId"
    WHERE c.status = 'ACTIVE'
      AND m.modality = 'TEXT'
      AND COALESCE((c."costPrice"->>'inputPer1M')::numeric, 0) = 0
      AND COALESCE((c."costPrice"->>'outputPer1M')::numeric, 0) = 0
      AND COALESCE((c."costPrice"->>'perCall')::numeric, 0) = 0
    ORDER BY p.name, m.name
  `);

  return rows
    .filter((r) => !only?.length || only.includes(r.channelId))
    .map((r) => ({
      channelId: r.channelId,
      provider: r.provider,
      modelName: r.modelName,
      realModelId: r.realModelId,
      enabledAliases: r.aliases ? r.aliases.split(",") : [],
      originalCostPrice: r.costPrice,
    }));
}

export async function backfillZeroCostChannels(
  prisma: PrismaClient,
  opts: { dryRun?: boolean; only?: string[]; stamp?: string } = {},
): Promise<BackfillResult> {
  const dryRun = opts.dryRun ?? true;
  const index = buildIndex(loadSnapshot());
  const channels = await loadZeroCostChannels(prisma, opts.only);

  const plan: BackfillPlanRow[] = [];
  const skipped: BackfillSkipRow[] = [];

  for (const ch of channels) {
    const r = matchPrice([ch.realModelId, ch.modelName], index);
    if (r.matched && r.price) {
      plan.push({
        channel: ch,
        openRouterId: r.openRouterId!,
        inputPer1M: r.price.inputPer1M,
        outputPer1M: r.price.outputPer1M,
      });
    } else {
      skipped.push({ channel: ch, reason: r.reason!, candidates: r.candidates });
    }
  }

  if (dryRun) return { plan, skipped, applied: 0 };

  // 落库前先写回滚清单（含每条通道的原 costPrice）
  const stamp = opts.stamp ?? "manual";
  const rollbackFile = join(PRICING_DIR, `backfill-rollback-${stamp}.json`);
  writeFileSync(
    rollbackFile,
    JSON.stringify(
      plan.map((p) => ({
        channelId: p.channel.channelId,
        provider: p.channel.provider,
        model: p.channel.modelName,
        originalCostPrice: p.channel.originalCostPrice,
      })),
      null,
      2,
    ),
  );

  let applied = 0;
  for (const p of plan) {
    // 只写 costPrice —— 绝不触碰 sellPrice（spec D6）
    await prisma.channel.update({
      where: { id: p.channel.channelId },
      data: {
        costPrice: {
          unit: "token",
          inputPer1M: p.inputPer1M,
          outputPer1M: p.outputPer1M,
        },
      },
    });
    applied++;
  }

  return { plan, skipped, applied, rollbackFile };
}

// ----------------------------------------------------------------
// CLI
// ----------------------------------------------------------------

function parseOnly(): string[] | undefined {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  return arg
    ? arg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
}

async function cli(): Promise<void> {
  const apply = process.argv.includes("--apply") || process.env.APPLY === "1";
  const only = parseOnly();
  const stamp = process.env.STAMP ?? new Date().toISOString().slice(0, 10);
  const prisma = new PrismaClient();

  try {
    console.log(
      apply
        ? "[APPLY] 回填零成本通道 costPrice（不触碰任何 sellPrice）..."
        : "[DRY RUN] 不写库；打印将回填/跳过的清单。加 --apply 真正写入。",
    );
    console.log();

    const r = await backfillZeroCostChannels(prisma, { dryRun: !apply, only, stamp });

    console.log(`=== 将回填 ${r.plan.length} 条 ===`);
    for (const p of r.plan) {
      const live = p.channel.enabledAliases.length
        ? `[${p.channel.enabledAliases.join(",")}]`
        : "(休眠)";
      console.log(
        `  ${p.channel.provider.padEnd(12)} ${p.channel.modelName.slice(0, 36).padEnd(36)} ` +
          `${live.slice(0, 28).padEnd(28)} ← ${p.openRouterId.slice(0, 34).padEnd(34)} ` +
          `${p.inputPer1M}/${p.outputPer1M}`,
      );
    }

    console.log();
    console.log(`=== 跳过 ${r.skipped.length} 条（逐条给出原因，无静默丢弃）===`);
    const byReason = new Map<string, BackfillSkipRow[]>();
    for (const s of r.skipped) {
      const list = byReason.get(s.reason) ?? [];
      list.push(s);
      byReason.set(s.reason, list);
    }
    for (const [reason, list] of [...byReason.entries()].sort()) {
      const live = list.filter((s) => s.channel.enabledAliases.length).length;
      console.log(`  ${reason}: ${list.length} 条（其中挂启用别名 ${live} 条）`);
      for (const s of list.filter((x) => x.channel.enabledAliases.length)) {
        const cand = s.candidates?.length ? ` 候选=${s.candidates.join("|")}` : "";
        console.log(
          `      ${s.channel.provider}/${s.channel.modelName} [${s.channel.enabledAliases.join(",")}]${cand}`,
        );
      }
    }

    console.log();
    const liveTotal = [...r.plan.map((p) => p.channel), ...r.skipped.map((s) => s.channel)].filter(
      (c) => c.enabledAliases.length,
    ).length;
    const livePlanned = r.plan.filter((p) => p.channel.enabledAliases.length).length;
    console.log(
      `统计：候选 ${r.plan.length + r.skipped.length} 条 | 可回填 ${r.plan.length} 条 | ` +
        `跳过 ${r.skipped.length} 条 | 线上（挂启用别名）${livePlanned}/${liveTotal} 条可回填`,
    );
    if (apply) {
      console.log(`已写入 ${r.applied} 条；回滚清单：${r.rollbackFile}`);
    }
  } finally {
    await prisma.$disconnect();
    await disconnectRedis().catch(() => {});
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /backfill-zero-cost-channels\.ts$/.test(process.argv[1]);

if (isDirectRun) {
  cli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
