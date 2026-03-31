export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const modalityFilter = url.searchParams.get("modality")?.toUpperCase();
  const search = url.searchParams.get("search")?.toLowerCase();

  // 1. Fetch all models with their channels (including provider info)
  const models = await prisma.model.findMany({
    where: {
      channels: { some: {} },
      ...(modalityFilter ? { modality: modalityFilter as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" } : {}),
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
    statsMap.set(s.channelId, {
      totalCalls: s._count.id,
      successCalls: 0,
      avgLatencyMs: s._avg.latencyMs,
    });
  }
  for (const s of successCounts) {
    const entry = statsMap.get(s.channelId);
    if (entry) entry.successCalls = s._count.id;
  }

  // 3. Build model-first grouped response
  const result = models.map((model) => {
    const sortedChannels = [...model.channels].sort(
      (a, b) => a.priority - b.priority,
    );

    const channelEntries = sortedChannels.map((ch) => {
      const stats = statsMap.get(ch.id);
      const hc = ch.healthChecks[0];

      let latencyMs: number | null = null;
      let successRate: number | null = null;

      if (stats && stats.totalCalls > 0) {
        latencyMs = stats.avgLatencyMs
          ? Math.round(stats.avgLatencyMs)
          : null;
        successRate = Math.round(
          (stats.successCalls / stats.totalCalls) * 100,
        );
      } else if (hc) {
        latencyMs = hc.latencyMs;
        successRate = hc.result === "PASS" ? 100 : 0;
      }

      return {
        id: ch.id,
        realModelId: ch.realModelId,
        providerName: ch.provider.displayName,
        providerId: ch.provider.id,
        priority: ch.priority,
        costPrice: ch.costPrice,
        sellPrice: ch.sellPrice,
        sellPriceLocked: ch.sellPriceLocked,
        status: ch.status,
        latencyMs,
        successRate,
        totalCalls: stats?.totalCalls ?? 0,
      };
    });

    // Model health = best ACTIVE channel's health
    const bestActive = channelEntries.find((c) => c.status === "ACTIVE");
    let healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown" =
      "unknown";
    if (bestActive) {
      if (bestActive.successRate !== null && bestActive.successRate >= 90)
        healthStatus = "healthy";
      else if (
        bestActive.successRate !== null &&
        bestActive.successRate >= 50
      )
        healthStatus = "degraded";
      else if (bestActive.successRate !== null)
        healthStatus = "unhealthy";
    }

    // Best sellPrice (from highest priority ACTIVE channel)
    const bestSellPrice = sortedChannels.find(
      (c) => c.status === "ACTIVE",
    )?.sellPrice;

    // Channel status summary
    const activeCount = sortedChannels.filter(
      (c) => c.status === "ACTIVE",
    ).length;
    const degradedCount = sortedChannels.filter(
      (c) => c.status === "DEGRADED",
    ).length;
    const disabledCount = sortedChannels.filter(
      (c) => c.status === "DISABLED",
    ).length;

    return {
      id: model.id,
      name: model.name,
      displayName: model.displayName,
      modality: model.modality,
      contextWindow: model.contextWindow,
      healthStatus,
      sellPrice: bestSellPrice ?? null,
      summary: {
        channelCount: channelEntries.length,
        activeChannels: activeCount,
        degradedChannels: degradedCount,
        disabledChannels: disabledCount,
      },
      channels: channelEntries,
    };
  });

  return NextResponse.json({ data: result });
}
