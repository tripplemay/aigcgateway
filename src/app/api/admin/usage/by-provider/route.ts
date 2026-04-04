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

  const cacheKey = `cache:admin:usage:by-provider:${period}`;
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
      provider_name: string;
      calls: bigint;
      cost: number;
      revenue: number;
    }>
  >`
    SELECT p.name AS provider_name,
           COUNT(cl.id)::bigint AS calls,
           COALESCE(SUM(cl."costPrice"), 0)::float AS cost,
           COALESCE(SUM(cl."sellPrice"), 0)::float AS revenue
    FROM call_logs cl
    JOIN channels ch ON cl."channelId" = ch.id
    JOIN providers p ON ch."providerId" = p.id
    WHERE cl."createdAt" >= ${since}
    GROUP BY p.name
    ORDER BY revenue DESC
  `;

  const json = JSON.stringify({
    data: results.map((r) => ({
      provider: r.provider_name,
      calls: Number(r.calls),
      cost: r.cost,
      revenue: r.revenue,
      margin: r.revenue - r.cost,
      marginPercent: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0,
    })),
  });

  if (redis) {
    redis.set(cacheKey, json, "EX", CACHE_TTL).catch(() => {});
  }
  return new Response(json, { headers: { "Content-Type": "application/json" } });
}
