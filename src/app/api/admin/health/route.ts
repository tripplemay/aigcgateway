export const dynamic = "force-dynamic";
/**
 * GET /api/admin/health
 *
 * 按 ModelAlias 分组返回通道健康状态。
 * 每个 alias 包含其关联 channel 列表、聚合统计、高风险标识。
 * 未关联任何 alias 的 channel 归入 orphans 列表。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

// ── helpers ──────────────────────────────────────────────────

interface ChannelRow {
  channelId: string;
  provider: string;
  providerName: string;
  model: string;
  modelDisplayName: string;
  modality: string;
  realModelId: string;
  status: string;
  priority: number;
  lastChecks: Array<{
    level: string;
    result: string;
    latencyMs: number | null;
    errorMessage: string | null;
    createdAt: Date;
  }>;
  lastCheckedAt: string | null;
  consecutiveFailures: number;
}

function buildChannelRow(ch: {
  id: string;
  realModelId: string;
  status: string;
  priority: number;
  provider: { name: string; displayName: string };
  model: { name: string; displayName: string; modality: string };
  healthChecks: Array<{
    level: string;
    result: string;
    latencyMs: number | null;
    errorMessage: string | null;
    createdAt: Date;
  }>;
}): ChannelRow {
  const lastCheckedAt =
    ch.healthChecks.length > 0 ? ch.healthChecks[0].createdAt.toISOString() : null;

  // Group by batch (same second) and count consecutive failed batches
  let consecutiveFailures = 0;
  const batches: Array<{ hasFail: boolean }> = [];
  let currentBatchTime = 0;
  for (const hc of ch.healthChecks) {
    const t = Math.floor(hc.createdAt.getTime() / 1000);
    if (t !== currentBatchTime) {
      batches.push({ hasFail: hc.result === "FAIL" });
      currentBatchTime = t;
    } else if (hc.result === "FAIL") {
      batches[batches.length - 1].hasFail = true;
    }
  }
  const firstPass = batches.findIndex((b) => !b.hasFail);
  consecutiveFailures = firstPass === -1 ? batches.length : firstPass;

  return {
    channelId: ch.id,
    provider: ch.provider.displayName,
    providerName: ch.provider.name,
    model: ch.model.name,
    modelDisplayName: ch.model.displayName,
    modality: ch.model.modality,
    realModelId: ch.realModelId,
    status: ch.status,
    priority: ch.priority,
    lastChecks: ch.healthChecks,
    lastCheckedAt,
    consecutiveFailures,
  };
}

function computeAvgLatency(channels: ChannelRow[]): number | null {
  const latencies: number[] = [];
  for (const ch of channels) {
    for (const hc of ch.lastChecks) {
      if (hc.latencyMs != null) {
        latencies.push(hc.latencyMs);
        break; // only latest per channel
      }
    }
  }
  if (latencies.length === 0) return null;
  return Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
}

// ── route ────────────────────────────────────────────────────

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  // Fetch all aliases with linked models → channels → healthChecks
  const aliases = await prisma.modelAlias.findMany({
    include: {
      models: {
        include: {
          model: {
            include: {
              channels: {
                include: {
                  provider: { select: { name: true, displayName: true } },
                  model: { select: { name: true, displayName: true, modality: true } },
                  healthChecks: {
                    orderBy: { createdAt: "desc" },
                    take: 3,
                    select: {
                      level: true,
                      result: true,
                      latencyMs: true,
                      errorMessage: true,
                      createdAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ enabled: "desc" }, { alias: "asc" }],
  });

  // Collect all channel IDs that belong to at least one alias
  const linkedChannelIds = new Set<string>();

  const aliasGroups = aliases.map((a) => {
    const channels: ChannelRow[] = [];
    for (const link of a.models) {
      for (const ch of link.model.channels) {
        linkedChannelIds.add(ch.id);
        channels.push(buildChannelRow(ch));
      }
    }
    // sort channels: ACTIVE first, then by priority
    channels.sort((x, y) => {
      const statusOrder: Record<string, number> = { ACTIVE: 0, DEGRADED: 1, DISABLED: 2 };
      const diff = (statusOrder[x.status] ?? 9) - (statusOrder[y.status] ?? 9);
      if (diff !== 0) return diff;
      return x.priority - y.priority;
    });

    const activeCount = channels.filter((c) => c.status === "ACTIVE").length;
    const degradedCount = channels.filter((c) => c.status === "DEGRADED").length;
    const disabledCount = channels.filter((c) => c.status === "DISABLED").length;

    return {
      aliasId: a.id,
      alias: a.alias,
      brand: a.brand,
      modality: a.modality,
      enabled: a.enabled,
      channelCount: channels.length,
      activeCount,
      degradedCount,
      disabledCount,
      avgLatency: computeAvgLatency(channels),
      highRisk: a.enabled && (activeCount === 0 || (activeCount <= 1 && channels.length > 1)),
      channels,
    };
  });

  // Find orphan channels (not linked to any alias)
  const orphanChannels = await prisma.channel.findMany({
    where: { id: { notIn: [...linkedChannelIds] } },
    include: {
      provider: { select: { name: true, displayName: true } },
      model: { select: { name: true, displayName: true, modality: true } },
      healthChecks: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          level: true,
          result: true,
          latencyMs: true,
          errorMessage: true,
          createdAt: true,
        },
      },
    },
  });

  const orphans = orphanChannels.map((ch) => buildChannelRow(ch));

  // Global summary
  const allChannels = [...aliasGroups.flatMap((g) => g.channels), ...orphans];
  const summary = {
    active: allChannels.filter((c) => c.status === "ACTIVE").length,
    degraded: allChannels.filter((c) => c.status === "DEGRADED").length,
    disabled: allChannels.filter((c) => c.status === "DISABLED").length,
    total: allChannels.length,
    avgLatency: computeAvgLatency(allChannels),
    aliasCount: aliases.length,
    highRiskCount: aliasGroups.filter((g) => g.highRisk).length,
  };

  return NextResponse.json({ summary, aliases: aliasGroups, orphans });
}
