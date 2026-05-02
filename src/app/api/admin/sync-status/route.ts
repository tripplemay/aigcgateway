export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { getRedis } from "@/lib/redis";
import {
  ALIAS_STATUS_BUCKETS,
  SQL_ALIAS_HAS_NO_USABLE_SELL_PRICE_BARE,
  SQL_ALIAS_STATUS_CASE,
  type AliasStatusBucket,
} from "@/lib/sql/alias-status";

const CACHE_KEY = "cache:admin:sync-status";
const CACHE_TTL = 30; // seconds

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  // Redis 缓存
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        return new NextResponse(cached, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    } catch {
      // Redis 读失败则 fallthrough
    }
  }

  // 合并多次 getConfig 为单次 findMany
  const configs = await prisma.systemConfig.findMany({
    where: { key: { in: ["LAST_SYNC_TIME", "LAST_SYNC_RESULT", "LAST_INFERENCE_RESULT"] } },
  });
  const configMap = new Map(configs.map((c) => [c.key, c.value]));

  const lastSyncTime = configMap.get("LAST_SYNC_TIME") ?? null;
  const lastSyncResultRaw = configMap.get("LAST_SYNC_RESULT");
  const lastInferenceResultRaw = configMap.get("LAST_INFERENCE_RESULT");

  let lastSyncResult = null;
  if (lastSyncResultRaw) {
    try {
      lastSyncResult = JSON.parse(lastSyncResultRaw);
    } catch {
      lastSyncResult = null;
    }
  }

  // 零定价 Channel 统计（可观测性：F-DATA-02）+ alias 层度量（PHASE2 F-SI2-02）。
  // 三个查询并行，共享同一 30s 缓存窗口。
  const [zeroPriceCount, unpricedAliasCount, zeroPriceByAliasStatusRows] = await Promise.all([
    prisma.$queryRawUnsafe<[{ cnt: number }]>(
      `SELECT count(*)::int as cnt FROM channels
       WHERE status = 'ACTIVE'
         AND COALESCE(("sellPrice"::jsonb->>'inputPer1M')::float, 0) = 0
         AND COALESCE(("sellPrice"::jsonb->>'outputPer1M')::float, 0) = 0
         AND COALESCE(("sellPrice"::jsonb->>'perCall')::float, 0) = 0`,
    ),
    // 已启用 alias 但未设售价（用户面 /v1/models 价格字段空白）— 真度量。
    // SQL_ALIAS_HAS_NO_USABLE_SELL_PRICE_BARE 与 /v1/models route.ts:80 的
    // `sellPrice && Object.keys(sellPrice).length > 0` 反向语义一致：
    // SQL NULL / JSON null（Prisma 写 sellPrice:null 的实际存法）/ 空对象
    // 都计入 unpriced。
    prisma.$queryRawUnsafe<[{ cnt: number }]>(
      `SELECT count(*)::int as cnt FROM model_aliases
       WHERE enabled = true
         AND ${SQL_ALIAS_HAS_NO_USABLE_SELL_PRICE_BARE}`,
    ),
    // 零价 ACTIVE channel 按 alias_status 4 类分组（与 PHASE1 scan 同款 CASE）。
    prisma.$queryRawUnsafe<{ bucket: AliasStatusBucket; cnt: number }[]>(
      `SELECT
         ${SQL_ALIAS_STATUS_CASE} AS bucket,
         count(*)::int AS cnt
       FROM channels c
       JOIN models m ON m.id = c."modelId"
       WHERE c.status = 'ACTIVE'
         AND COALESCE((c."sellPrice"::jsonb->>'inputPer1M')::float, 0) = 0
         AND COALESCE((c."sellPrice"::jsonb->>'outputPer1M')::float, 0) = 0
         AND COALESCE((c."sellPrice"::jsonb->>'perCall')::float, 0) = 0
       GROUP BY bucket`,
    ),
  ]);

  // 4 bucket 全部初始化为 0，再用查询结果填入（缺失的 bucket 保留 0）。
  const zeroPriceChannelsByAliasStatus: Record<AliasStatusBucket, number> = {
    enabledAliasPriced: 0,
    enabledAliasUnpriced: 0,
    disabledAliasOnly: 0,
    noAlias: 0,
  };
  for (const row of zeroPriceByAliasStatusRows) {
    if (ALIAS_STATUS_BUCKETS.includes(row.bucket)) {
      zeroPriceChannelsByAliasStatus[row.bucket] = row.cnt;
    }
  }

  // F-INFRA-06: 从 LAST_SYNC_RESULT 提取 lastSyncAt / lastSyncDuration / lastSyncResult
  let lastSyncAt: string | null = lastSyncTime;
  let lastSyncDuration: number | null = null;
  let lastSyncResultSummary: "success" | "partial" | "failed" | null = null;

  if (lastSyncResult && typeof lastSyncResult === "object") {
    if (typeof lastSyncResult.durationMs === "number") {
      lastSyncDuration = +(lastSyncResult.durationMs / 1000).toFixed(1);
    }
    const summary = lastSyncResult.summary as Record<string, number> | undefined;
    if (summary) {
      if (summary.totalFailedProviders === 0) {
        lastSyncResultSummary = "success";
      } else if (
        Array.isArray(lastSyncResult.providers) &&
        summary.totalFailedProviders < (lastSyncResult.providers as unknown[]).length
      ) {
        lastSyncResultSummary = "partial";
      } else {
        lastSyncResultSummary = "failed";
      }
    }
  }

  let lastInferenceResult = null;
  if (lastInferenceResultRaw) {
    try {
      lastInferenceResult = JSON.parse(lastInferenceResultRaw);
    } catch {
      lastInferenceResult = null;
    }
  }

  const json = JSON.stringify({
    data: {
      lastSyncTime,
      lastSyncResultDetail: lastSyncResult,
      zeroPriceActiveChannels: zeroPriceCount[0]?.cnt ?? 0,
      // PHASE2 F-SI2-02: alias 层真度量（用户面 /v1/models 价格空白）。
      unpricedActiveAliases: unpricedAliasCount[0]?.cnt ?? 0,
      // PHASE2 F-SI2-02: 旧 zeroPriceActiveChannels 4 类细分。
      zeroPriceChannelsByAliasStatus,
      lastSyncAt,
      lastSyncDuration,
      lastSyncResult: lastSyncResultSummary,
      lastInferenceResult,
    },
  });

  // 写入 Redis 缓存
  if (redis) {
    redis.set(CACHE_KEY, json, "EX", CACHE_TTL).catch(() => {});
  }

  return new NextResponse(json, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
