export const dynamic = "force-dynamic";
/**
 * GET /api/admin/health
 *
 * 返回所有通道健康状态概览
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;
  const channels = await prisma.channel.findMany({
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
    orderBy: [{ provider: { name: "asc" } }, { model: { name: "asc" } }],
  });

  const summary = {
    active: channels.filter((c) => c.status === "ACTIVE").length,
    degraded: channels.filter((c) => c.status === "DEGRADED").length,
    disabled: channels.filter((c) => c.status === "DISABLED").length,
    total: channels.length,
  };

  const data = channels.map((ch) => {
    // F-INFRA-06: lastCheckedAt + consecutiveFailures
    const lastCheckedAt =
      ch.healthChecks.length > 0 ? ch.healthChecks[0].createdAt.toISOString() : null;

    // 连续失败次数：从最近的 check 往前数直到遇到非 FAIL
    let consecutiveFailures = 0;
    for (const hc of ch.healthChecks) {
      if (hc.result === "FAIL") {
        consecutiveFailures++;
      } else {
        break;
      }
    }

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
  });

  return NextResponse.json({ summary, data });
}
