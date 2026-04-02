export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import {
  getCachedChannels,
  setCachedChannels,
  acquireLock,
  releaseLock,
  waitForCache,
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

/** 带 Redis 分布式锁的 singleflight 查询 */
async function getChannelsWithCache(): Promise<string> {
  // 1. 读缓存
  const cached = await getCachedChannels();
  if (cached) return cached;

  // 2. 抢锁
  const locked = await acquireLock();
  if (locked) {
    try {
      const json = await queryChannelsJSON(null, null, null);
      await setCachedChannels(json);
      return json;
    } finally {
      await releaseLock();
    }
  }

  // 3. 未抢到锁，等待缓存
  const waited = await waitForCache();
  if (waited) return waited;

  // 4. 兜底：直接查 DB（不写缓存）
  return queryChannelsJSON(null, null, null);
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

  const json = hasFilter
    ? await queryChannelsJSON(providerId, modelId, status ?? null)
    : await getChannelsWithCache();

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

  await invalidateChannelsCache();
  return NextResponse.json(channel, { status: 201 });
}
