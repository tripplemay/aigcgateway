/**
 * BL-DEEPSEEK-V4-HOTFIX F-DSV4-01 — 下架 deepseek 直连的陈旧通道。
 *
 * ## 背景
 *
 * DeepSeek 直连 API 于 2026-07 下线了 `deepseek-chat` / `deepseek-reasoner`，
 * `/models` 只剩 `deepseek-v4-pro` / `deepseek-v4-flash`。生产 3 条 ACTIVE 通道
 * 的 realModelId 仍是旧名，其中两条 priority=1（router 按 priority ASC 取优，
 * 即别名的第一选择），上游返回 400 且 INVALID_REQUEST ∈ failover NEVER_RETRY
 * → 同别名下健康通道一条未试，`deepseek-v3` / `deepseek-r1` 别名硬失败。
 *
 * model-sync 本可自动下架（model-sync.ts:400 toDisable），但被 :489 的缩水护栏
 * （远端模型数 < 现存通道数 50%）拦下，5 天静默未处理。本脚本做一次性止血。
 *
 * ## 判定规则（不硬编码通道 ID）
 *
 * 真值来源是**实拉一次上游 /models**（复用 deepseekAdapter.fetchModels，与
 * model-sync 同一代码路径）。provider=deepseek 下 realModelId 不在该集合内的
 * ACTIVE/DEGRADED 通道 → DISABLED。上游拉取失败或返回 0 个模型 → 立即中止，
 * 不做任何写入（避免上游抖动导致误下架，与 model-sync.ts:476 同一防御思路）。
 *
 * ## 明确不做
 *
 * - 不改 realModelId、不把 `deepseek-v3` / `deepseek-r1` 别名重指到 v4。
 *   DeepSeek 直连已彻底没有 V3/R1，但 qwen / volcengine / siliconflow /
 *   openrouter 仍在供；静默把 v3 别名指向 v4 会让用户拿到与请求不符的模型。
 *   要 V4 走已上线的 `deepseek-v4-pro` / `deepseek-v4-flash` 别名。
 * - 不碰其他 provider（本次只处理 deepseek，见 spec §5）。
 *
 * ## 用法
 *
 *   npx tsx scripts/hotfix-deepseek-v4-retire-legacy.ts            # dry-run（默认）
 *   npx tsx scripts/hotfix-deepseek-v4-retire-legacy.ts --apply    # 写库 + 清 models:list 缓存
 *   APPLY=1 npx tsx scripts/hotfix-deepseek-v4-retire-legacy.ts
 *
 * 幂等：重跑输出 0 变更。
 * 回滚：把对应 channel 的 status 改回 ACTIVE 即可（纯数据操作，无 schema 变更）。
 */

import { PrismaClient } from "@prisma/client";
import { deepseekAdapter } from "../src/lib/sync/adapters/deepseek";
import type { ProviderWithConfig } from "../src/lib/sync/types";
import { invalidateModelsListCache } from "../src/lib/cache/models-cache";
import { disconnectRedis } from "../src/lib/redis";

const PROVIDER_NAME = "deepseek";

/** 只下架仍在服役的通道；已 DISABLED 的跳过（幂等的来源）。 */
const LIVE_STATUSES = ["ACTIVE", "DEGRADED"] as const;

export interface ChannelSnapshot {
  id: string;
  modelName: string;
  realModelId: string;
  status: string;
  priority: number;
  /** 该 model 挂在哪些别名下（含别名 enabled 状态），用于评估影响面 */
  aliases: Array<{ alias: string; enabled: boolean }>;
}

export interface RetireResult {
  /** 上游 /models 返回的 realModelId 集合 */
  upstreamModelIds: string[];
  /** 执行前 provider 下全部通道快照 */
  before: ChannelSnapshot[];
  /** 判定为陈旧、待下架（dry-run）或已下架（--apply）的通道 */
  stale: ChannelSnapshot[];
  /** 上游仍在服役、保留的通道 */
  kept: ChannelSnapshot[];
  applied: boolean;
  disabledCount: number;
}

function fmt(c: ChannelSnapshot): string {
  const aliasStr =
    c.aliases.length === 0
      ? "(无别名)"
      : c.aliases.map((a) => `${a.alias}${a.enabled ? "" : "[disabled]"}`).join(", ");
  return `  model=${c.modelName} realModelId=${c.realModelId} status=${c.status} priority=${c.priority} 别名=${aliasStr}`;
}

async function snapshotChannels(
  prisma: PrismaClient,
  providerId: string,
): Promise<ChannelSnapshot[]> {
  const channels = await prisma.channel.findMany({
    where: { providerId },
    include: {
      model: {
        select: {
          name: true,
          aliasLinks: { select: { alias: { select: { alias: true, enabled: true } } } },
        },
      },
    },
    orderBy: [{ priority: "asc" }, { realModelId: "asc" }],
  });

  return channels.map((c) => ({
    id: c.id,
    modelName: c.model.name,
    realModelId: c.realModelId,
    status: c.status,
    priority: c.priority,
    aliases: c.model.aliasLinks.map((l) => ({ alias: l.alias.alias, enabled: l.alias.enabled })),
  }));
}

export async function retireLegacyDeepseekChannels(
  prisma: PrismaClient,
  apply: boolean,
): Promise<RetireResult> {
  const provider = await prisma.provider.findUnique({
    where: { name: PROVIDER_NAME },
    include: { config: true },
  });
  if (!provider) throw new Error(`provider "${PROVIDER_NAME}" 不存在`);

  // ---- 真值来源：实拉上游 /models ----
  let upstream: Array<{ modelId: string }>;
  try {
    upstream = await deepseekAdapter.fetchModels(provider as ProviderWithConfig);
  } catch (err) {
    throw new Error(
      `上游 /models 拉取失败，已中止（不做任何写入）：${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const upstreamModelIds = upstream.map((m) => m.modelId);
  if (upstreamModelIds.length === 0) {
    throw new Error("上游 /models 返回 0 个模型，已中止（不做任何写入）——疑似上游抖动或鉴权异常");
  }
  const upstreamSet = new Set(upstreamModelIds);

  const before = await snapshotChannels(prisma, provider.id);
  const live = before.filter((c) => (LIVE_STATUSES as readonly string[]).includes(c.status));
  const stale = live.filter((c) => !upstreamSet.has(c.realModelId));
  const kept = live.filter((c) => upstreamSet.has(c.realModelId));

  let disabledCount = 0;
  if (apply && stale.length > 0) {
    const res = await prisma.channel.updateMany({
      where: { id: { in: stale.map((c) => c.id) } },
      data: { status: "DISABLED" },
    });
    disabledCount = res.count;
    invalidateModelsListCache();
  }

  return { upstreamModelIds, before, stale, kept, applied: apply, disabledCount };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply") || process.env.APPLY === "1";
  const prisma = new PrismaClient();

  try {
    console.log(`=== BL-DEEPSEEK-V4-HOTFIX F-DSV4-01 — provider=${PROVIDER_NAME} ===`);
    console.log(`模式：${apply ? "APPLY（写库）" : "DRY-RUN（只盘点，不写库）"}\n`);

    const result = await retireLegacyDeepseekChannels(prisma, apply);

    console.log(`上游 /models 返回 ${result.upstreamModelIds.length} 个模型：`);
    console.log(`  ${result.upstreamModelIds.join(", ")}\n`);

    console.log(`--- 执行前通道快照（${result.before.length} 条）---`);
    for (const c of result.before) console.log(fmt(c));

    console.log(`\n--- 保留（上游仍在服役，${result.kept.length} 条）---`);
    if (result.kept.length === 0) console.log("  (无)");
    for (const c of result.kept) console.log(fmt(c));

    console.log(
      `\n--- ${apply ? "已下架" : "待下架"}（realModelId 不在上游集合内，${result.stale.length} 条）---`,
    );
    if (result.stale.length === 0) console.log("  (无 — 已是干净状态)");
    for (const c of result.stale) console.log(fmt(c));

    if (apply) {
      console.log(
        `\n写入完成：${result.disabledCount} 条通道 → DISABLED；已清 models:list* 缓存。`,
      );
      const after = await snapshotChannels(
        prisma,
        (
          await prisma.provider.findUniqueOrThrow({
            where: { name: PROVIDER_NAME },
            select: { id: true },
          })
        ).id,
      );
      console.log(`\n--- 执行后通道快照（${after.length} 条）---`);
      for (const c of after) console.log(fmt(c));
    } else if (result.stale.length > 0) {
      console.log(`\n加 --apply 执行下架。`);
    }
  } finally {
    await prisma.$disconnect();
    await disconnectRedis();
  }
}

// 直接执行时跑 main；被 import（测试）时不跑
if (process.argv[1]?.includes("hotfix-deepseek-v4-retire-legacy")) {
  main().catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
