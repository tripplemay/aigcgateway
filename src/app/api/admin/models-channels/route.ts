export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { getRedis } from "@/lib/redis";

const CACHE_TTL = 300; // 5 分钟

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const modalityFilter = url.searchParams.get("modality")?.toUpperCase();
  const search = url.searchParams.get("search")?.toLowerCase();

  // 读 Redis 缓存（无 modality/search 时走主 key，与 model-sync invalidation 一致）
  const cacheKey =
    modalityFilter || search
      ? `cache:admin:channels:${modalityFilter ?? ""}:${search ?? ""}`
      : "cache:admin:channels";

  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return new Response(cached, { headers: { "Content-Type": "application/json" } });
    } catch {
      // Redis 不可用，降级走 DB
    }
  }

  // 1. Fetch all models with their channels (including provider info)
  const models = await prisma.model.findMany({
    where: {
      channels: { some: {} },
      ...(modalityFilter
        ? { modality: modalityFilter as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" }
        : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    include: {
      channels: {
        include: {
          provider: { select: { id: true, name: true, displayName: true, status: true } },
          healthChecks: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { result: true, latencyMs: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // 2. Get CallLog stats for the last 7 days per channel
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const callLogStats = await prisma.callLog.groupBy({
    by: ["channelId"],
    where: { createdAt: { gte: sevenDaysAgo } },
    _count: { id: true },
    _avg: { latencyMs: true },
  });

  const successCounts = await prisma.callLog.groupBy({
    by: ["channelId"],
    where: {
      createdAt: { gte: sevenDaysAgo },
      status: "SUCCESS",
    },
    _count: { id: true },
  });

  const statsMap = new Map<
    string,
    { totalCalls: number; successCalls: number; avgLatencyMs: number | null }
  >();
  for (const s of callLogStats) {
    if (!s.channelId) continue;
    statsMap.set(s.channelId, {
      totalCalls: s._count.id,
      successCalls: 0,
      avgLatencyMs: s._avg.latencyMs,
    });
  }
  for (const s of successCounts) {
    if (!s.channelId) continue;
    const entry = statsMap.get(s.channelId);
    if (entry) entry.successCalls = s._count.id;
  }

  // 3. Build channel entries with stats for each model
  function buildChannelEntry(ch: (typeof models)[0]["channels"][0]) {
    const stats = statsMap.get(ch.id);
    const hc = ch.healthChecks[0];
    let latencyMs: number | null = null;
    let successRate: number | null = null;
    if (stats && stats.totalCalls > 0) {
      latencyMs = stats.avgLatencyMs ? Math.round(stats.avgLatencyMs) : null;
      successRate = Math.round((stats.successCalls / stats.totalCalls) * 100);
    } else if (hc) {
      latencyMs = hc.latencyMs;
      successRate = hc.result === "PASS" ? 100 : 0;
    }
    return {
      id: ch.id,
      realModelId: ch.realModelId,
      priority: ch.priority,
      costPrice: ch.costPrice,
      sellPrice: ch.sellPrice,
      status: ch.status,
      latencyMs,
      successRate,
      totalCalls: stats?.totalCalls ?? 0,
    };
  }

  function deriveHealth(channels: ReturnType<typeof buildChannelEntry>[]) {
    const best = channels.find((c) => c.status === "ACTIVE");
    if (!best) return "unknown" as const;
    if (best.successRate !== null && best.successRate >= 90) return "healthy" as const;
    if (best.successRate !== null && best.successRate >= 50) return "degraded" as const;
    if (best.successRate !== null) return "unhealthy" as const;
    return "unknown" as const;
  }

  // 4. Group by provider
  const providerMap = new Map<
    string,
    {
      id: string;
      name: string;
      displayName: string;
      models: Map<
        string,
        { model: (typeof models)[0]; channels: ReturnType<typeof buildChannelEntry>[] }
      >;
    }
  >();

  for (const model of models) {
    for (const ch of model.channels) {
      const prov = ch.provider;
      let group = providerMap.get(prov.id);
      if (!group) {
        group = { id: prov.id, name: prov.name, displayName: prov.displayName, models: new Map() };
        providerMap.set(prov.id, group);
      }
      let modelGroup = group.models.get(model.id);
      if (!modelGroup) {
        modelGroup = { model, channels: [] };
        group.models.set(model.id, modelGroup);
      }
      modelGroup.channels.push(buildChannelEntry(ch));
    }
  }

  const result = Array.from(providerMap.values()).map((group) => {
    let activeChannels = 0,
      degradedChannels = 0,
      disabledChannels = 0;
    const modelEntries = Array.from(group.models.values()).map(({ model, channels }) => {
      const sorted = channels.sort((a, b) => a.priority - b.priority);
      activeChannels += sorted.filter((c) => c.status === "ACTIVE").length;
      degradedChannels += sorted.filter((c) => c.status === "DEGRADED").length;
      disabledChannels += sorted.filter((c) => c.status === "DISABLED").length;
      const bestSellPrice = sorted.find((c) => c.status === "ACTIVE")?.sellPrice ?? null;
      return {
        id: model.id,
        name: model.name,
        displayName: model.displayName,
        modality: model.modality,
        contextWindow: model.contextWindow,
        healthStatus: deriveHealth(sorted),
        sellPrice: bestSellPrice,
        channels: sorted,
      };
    });
    return {
      id: group.id,
      name: group.name,
      displayName: group.displayName,
      summary: {
        modelCount: modelEntries.length,
        activeChannels,
        degradedChannels,
        disabledChannels,
      },
      models: modelEntries,
    };
  });

  const json = JSON.stringify({ data: result });
  if (redis) {
    redis.set(cacheKey, json, "EX", CACHE_TTL).catch(() => {});
  }
  return new Response(json, { headers: { "Content-Type": "application/json" } });
}
