export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { getRedis } from "@/lib/redis";

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

  // 合并两次 getConfig 为单次 findMany
  const configs = await prisma.systemConfig.findMany({
    where: { key: { in: ["LAST_SYNC_TIME", "LAST_SYNC_RESULT"] } },
  });
  const configMap = new Map(configs.map((c) => [c.key, c.value]));

  const lastSyncTime = configMap.get("LAST_SYNC_TIME") ?? null;
  const lastSyncResultRaw = configMap.get("LAST_SYNC_RESULT");

  let lastSyncResult = null;
  if (lastSyncResultRaw) {
    try {
      lastSyncResult = JSON.parse(lastSyncResultRaw);
    } catch {
      lastSyncResult = null;
    }
  }

  // 零定价 Channel 统计（可观测性：F-DATA-02）
  const zeroPriceCount = await prisma.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT count(*)::int as cnt FROM channels
     WHERE status = 'ACTIVE'
       AND COALESCE(("sellPrice"::jsonb->>'inputPer1M')::float, 0) = 0
       AND COALESCE(("sellPrice"::jsonb->>'outputPer1M')::float, 0) = 0
       AND COALESCE(("sellPrice"::jsonb->>'perCall')::float, 0) = 0`,
  );

  const json = JSON.stringify({
    data: {
      lastSyncTime,
      lastSyncResult,
      zeroPriceActiveChannels: zeroPriceCount[0]?.cnt ?? 0,
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
