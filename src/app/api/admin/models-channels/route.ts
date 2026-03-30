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

  // 1. Fetch all providers with their channels, models, and health checks
  const providers = await prisma.provider.findMany({
    where: { status: "ACTIVE" },
    include: {
      channels: {
        include: {
          model: true,
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

  // 3. Build grouped response
  const result = providers.map((provider) => {
    // Group channels by model
    const modelMap = new Map<
      string,
      {
        model: (typeof provider.channels)[0]["model"];
        channels: typeof provider.channels;
      }
    >();

    for (const ch of provider.channels) {
      const key = ch.modelId;
      if (!modelMap.has(key)) {
        modelMap.set(key, { model: ch.model, channels: [] });
      }
      modelMap.get(key)!.channels.push(ch);
    }

    // Apply filters
    let models = Array.from(modelMap.values());

    if (modalityFilter) {
      models = models.filter((m) => m.model.modality === modalityFilter);
    }
    if (search) {
      models = models.filter((m) =>
        m.model.name.toLowerCase().includes(search),
      );
    }

    // Build model entries
    const modelEntries = models.map((entry) => {
      const sortedChannels = entry.channels.sort(
        (a, b) => a.priority - b.priority,
      );

      const channelEntries = sortedChannels.map((ch) => {
        const stats = statsMap.get(ch.id);
        const hc = ch.healthChecks[0];

        // Prefer CallLog stats, fallback to HealthCheck
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

      return {
        id: entry.model.id,
        name: entry.model.name,
        displayName: entry.model.displayName,
        modality: entry.model.modality,
        contextWindow: entry.model.contextWindow,
        healthStatus,
        sellPrice: bestSellPrice ?? null,
        channels: channelEntries,
      };
    });

    // Provider-level summary
    const allChannels = models.flatMap((m) => m.channels);
    const activeCount = allChannels.filter(
      (c) => c.status === "ACTIVE",
    ).length;
    const degradedCount = allChannels.filter(
      (c) => c.status === "DEGRADED",
    ).length;
    const disabledCount = allChannels.filter(
      (c) => c.status === "DISABLED",
    ).length;

    return {
      id: provider.id,
      name: provider.name,
      displayName: provider.displayName,
      summary: {
        modelCount: modelEntries.length,
        activeChannels: activeCount,
        degradedChannels: degradedCount,
        disabledChannels: disabledCount,
      },
      models: modelEntries,
    };
  });

  // Filter out providers with no models after filtering
  const filtered = result.filter((p) => p.models.length > 0);

  return NextResponse.json({ data: filtered });
}
