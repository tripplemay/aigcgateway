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
  const days = period === "today" ? 1 : period === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 86400000);

  const cacheKey = `cache:admin:usage:by-model:${period}`;
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return new Response(cached, { headers: { "Content-Type": "application/json" } });
    } catch {
      // Redis 不可用，降级走 DB
    }
  }

  const results = await prisma.$queryRaw<
    Array<{
      model_name: string;
      calls: bigint;
      tokens: bigint;
      cost: number;
      revenue: number;
      avg_latency: number;
    }>
  >`
    SELECT "modelName" AS model_name,
           COUNT(*)::bigint AS calls,
           COALESCE(SUM("totalTokens"), 0)::bigint AS tokens,
           COALESCE(SUM("costPrice"), 0)::float AS cost,
           COALESCE(SUM("sellPrice"), 0)::float AS revenue,
           COALESCE(AVG("latencyMs"), 0)::float AS avg_latency
    FROM call_logs
    WHERE "createdAt" >= ${since}
    GROUP BY "modelName"
    ORDER BY revenue DESC
  `;

  const json = JSON.stringify({
    data: results.map((r) => ({
      model: r.model_name,
      calls: Number(r.calls),
      tokens: Number(r.tokens),
      cost: r.cost,
      revenue: r.revenue,
      avgLatency: Math.round(r.avg_latency),
    })),
  });

  if (redis) {
    redis.set(cacheKey, json, "EX", CACHE_TTL).catch(() => {});
  }
  return new Response(json, { headers: { "Content-Type": "application/json" } });
}
