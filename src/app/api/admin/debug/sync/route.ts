export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  // 1. 从 SystemConfig 获取最近同步信息
  const configs = await prisma.systemConfig.findMany({
    where: { key: { in: ["LAST_SYNC_TIME", "LAST_SYNC_RESULT"] } },
  });
  const configMap = new Map(configs.map((c) => [c.key, c.value]));

  const lastSyncAt = configMap.get("LAST_SYNC_TIME") ?? null;

  let lastSyncDuration: number | null = null;
  let syncedModelCount = 0;
  let exposedModelCount = 0;

  const resultRaw = configMap.get("LAST_SYNC_RESULT");
  if (resultRaw) {
    try {
      const result = JSON.parse(resultRaw);
      if (typeof result.durationMs === "number") {
        lastSyncDuration = +(result.durationMs / 1000).toFixed(1);
      }
      if (Array.isArray(result.providers)) {
        syncedModelCount = result.providers.reduce(
          (sum: number, p: { modelCount?: number }) => sum + (p.modelCount ?? 0),
          0,
        );
      }
    } catch {
      // parse failure — leave defaults
    }
  }

  // 2. 当前可路由模型数（ACTIVE Channel 的去重 modelId 数）
  const activeModelCount = await prisma.channel.findMany({
    where: { status: "ACTIVE" },
    select: { modelId: true },
    distinct: ["modelId"],
  });
  exposedModelCount = activeModelCount.length;

  // 3. DISABLED 通道列表 + disable 原因
  const disabledChannels = await prisma.channel.findMany({
    where: { status: "DISABLED" },
    include: {
      provider: { select: { name: true } },
      model: { select: { name: true } },
      healthChecks: {
        where: { result: "FAIL" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { errorMessage: true },
      },
    },
  });

  const disabledList = disabledChannels.map((ch) => {
    // 规格要求：disabledReason 优先取 Channel.notes（当前 schema 无此字段），
    // 无则取该通道最近一条失败 HealthCheck 的 errorMessage
    const notes = (ch as Record<string, unknown>).notes as string | undefined;
    return {
      id: ch.id,
      name: ch.model.name,
      provider: ch.provider.name,
      disabledReason: notes || ch.healthChecks[0]?.errorMessage || null,
      disabledAt: ch.updatedAt.toISOString(),
    };
  });

  return NextResponse.json({
    lastSyncAt,
    lastSyncDuration,
    syncedModelCount,
    exposedModelCount,
    disabledChannels: disabledList,
  });
}
