export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  // 从 LAST_SYNC_RESULT 获取 per-provider enrichment 统计
  const config = await prisma.systemConfig.findUnique({
    where: { key: "LAST_SYNC_RESULT" },
  });

  if (!config) {
    return NextResponse.json({
      totalModels: 0,
      enrichedModels: 0,
      unenrichedModels: 0,
      enrichmentRate: "0.0%",
      byProvider: [],
    });
  }

  let providers: Array<{
    providerName: string;
    modelCount?: number;
    aiEnriched?: number;
  }> = [];

  try {
    const result = JSON.parse(config.value);
    if (Array.isArray(result.providers)) {
      providers = result.providers;
    }
  } catch {
    return NextResponse.json({
      totalModels: 0,
      enrichedModels: 0,
      unenrichedModels: 0,
      enrichmentRate: "0.0%",
      byProvider: [],
    });
  }

  let totalModels = 0;
  let enrichedModels = 0;

  const byProvider = providers
    .filter((p) => (p.modelCount ?? 0) > 0)
    .map((p) => {
      const total = p.modelCount ?? 0;
      const enriched = p.aiEnriched ?? 0;
      totalModels += total;
      enrichedModels += enriched;
      return {
        provider: p.providerName,
        total,
        enriched,
        rate: total > 0 ? `${((enriched / total) * 100).toFixed(1)}%` : "0.0%",
      };
    });

  const unenrichedModels = totalModels - enrichedModels;
  const enrichmentRate =
    totalModels > 0 ? `${((enrichedModels / totalModels) * 100).toFixed(1)}%` : "0.0%";

  return NextResponse.json({
    totalModels,
    enrichedModels,
    unenrichedModels,
    enrichmentRate,
    byProvider,
  });
}
