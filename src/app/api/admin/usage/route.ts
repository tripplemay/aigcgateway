export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { getRedis } from "@/lib/redis";

const CACHE_TTL = 600; // 10 分钟

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "7d";

  const cacheKey = `cache:admin:usage:${period}`;
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return new Response(cached, { headers: { "Content-Type": "application/json" } });
    } catch {
      // Redis 不可用，降级走 DB
    }
  }

  const days = period === "today" ? 1 : period === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 86400000);

  const agg = await prisma.callLog.aggregate({
    where: { createdAt: { gte: since } },
    _count: true,
    _sum: { totalTokens: true, sellPrice: true, costPrice: true },
    _avg: { latencyMs: true },
  });

  const successCount = await prisma.callLog.count({
    where: { createdAt: { gte: since }, status: "SUCCESS" },
  });

  const payload = {
    period,
    totalCalls: agg._count,
    totalTokens: agg._sum.totalTokens ?? 0,
    totalRevenue: Number(agg._sum.sellPrice ?? 0),
    totalCost: Number(agg._sum.costPrice ?? 0),
    margin: Number(agg._sum.sellPrice ?? 0) - Number(agg._sum.costPrice ?? 0),
    avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
    successRate: agg._count > 0 ? successCount / agg._count : 1,
  };

  const json = JSON.stringify(payload);
  if (redis) {
    redis.set(cacheKey, json, "EX", CACHE_TTL).catch(() => {});
  }
  return new Response(json, { headers: { "Content-Type": "application/json" } });
}
