export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import {
  getCachedChannels,
  getInflightQuery,
  setInflightQuery,
  setCachedChannels,
  clearInflightQuery,
  invalidateChannelsCache,
} from "./_cache";

async function queryChannelsJSON(
  providerId: string | null,
  modelId: string | null,
  status: string | null,
): Promise<string> {
  const channels = await prisma.channel.findMany({
    where: {
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {}),
      ...(status ? { status: status as "ACTIVE" | "DEGRADED" | "DISABLED" } : {}),
    },
    include: {
      provider: { select: { name: true, displayName: true } },
      model: { select: { name: true, displayName: true, modality: true } },
    },
    orderBy: [{ model: { name: "asc" } }, { priority: "asc" }],
  });

  // 批量查询每个 channel 的最新 HealthCheck（DISTINCT ON 原生 SQL）
  const channelIds = channels.map((ch) => ch.id);
  const healthMap = new Map<string, string>();

  if (channelIds.length > 0) {
    const healthRows = await prisma.$queryRaw<Array<{ channelId: string; result: string }>>`
      SELECT DISTINCT ON ("channelId") "channelId", result
      FROM health_checks
      WHERE "channelId" = ANY(${channelIds})
      ORDER BY "channelId", "createdAt" DESC
    `;
    for (const row of healthRows) {
      healthMap.set(row.channelId, row.result);
    }
  }

  return JSON.stringify({
    data: channels.map((ch) => ({
      id: ch.id,
      providerName: ch.provider.displayName,
      providerId: ch.providerId,
      modelName: ch.model.name,
      modelDisplayName: ch.model.displayName,
      modelId: ch.modelId,
      modality: ch.model.modality,
      realModelId: ch.realModelId,
      priority: ch.priority,
      costPrice: ch.costPrice,
      sellPrice: ch.sellPrice,
      sellPriceLocked: ch.sellPriceLocked,
      status: ch.status,
      lastHealthResult: healthMap.get(ch.id) ?? null,
    })),
  });
}

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const providerId = url.searchParams.get("providerId");
  const modelId = url.searchParams.get("modelId");
  const status = url.searchParams.get("status")?.toUpperCase();

  // 有过滤条件时跳过缓存，直接查 DB
  const hasFilter = providerId || modelId || status;

  if (!hasFilter) {
    // 缓存命中
    const cached = getCachedChannels();
    if (cached) {
      return new NextResponse(cached, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Singleflight：复用 inflight 查询
    const existing = getInflightQuery();
    if (existing) {
      const json = await existing;
      return new NextResponse(json, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // 新查询
    const promise = queryChannelsJSON(null, null, null)
      .then((json) => {
        setCachedChannels(json);
        return json;
      })
      .finally(() => {
        clearInflightQuery();
      });

    setInflightQuery(promise);

    const json = await promise;
    return new NextResponse(json, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // 有过滤条件，直接查
  const json = await queryChannelsJSON(providerId, modelId, status ?? null);
  return new NextResponse(json, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  if (!body.providerId || !body.modelId || !body.realModelId) {
    return errorResponse(400, "invalid_parameter", "providerId, modelId, realModelId required");
  }

  const channel = await prisma.channel.create({
    data: {
      providerId: body.providerId,
      modelId: body.modelId,
      realModelId: body.realModelId,
      priority: body.priority ?? 1,
      costPrice: body.costPrice ?? {},
      sellPrice: body.sellPrice ?? {},
      status: body.status ?? "ACTIVE",
    },
  });

  invalidateChannelsCache();
  return NextResponse.json(channel, { status: 201 });
}
