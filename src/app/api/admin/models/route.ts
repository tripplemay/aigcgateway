export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/**
 * GET /api/admin/models
 *
 * 返回全量模型（含 enabled/canonicalName/isVariant/channels/health 信息）
 * 支持 provider/modality/search 筛选
 * 按 canonicalName 分组，变体折叠返回
 */
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const modalityFilter = url.searchParams.get("modality")?.toUpperCase();
  const providerFilter = url.searchParams.get("provider");
  const search = url.searchParams.get("search")?.toLowerCase();

  const models = await prisma.model.findMany({
    where: {
      ...(modalityFilter
        ? { modality: modalityFilter as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" }
        : {}),
      ...(providerFilter ? { channels: { some: { provider: { name: providerFilter } } } } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    include: {
      channels: {
        include: {
          provider: { select: { id: true, name: true, displayName: true } },
          healthChecks: {
            orderBy: { createdAt: "desc" as const },
            take: 1,
            select: { result: true, latencyMs: true, createdAt: true },
          },
        },
        orderBy: { priority: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  // Build response with channel/health summary
  const items = models.map((m) => {
    const activeChannels = m.channels.filter((ch) => ch.status === "ACTIVE");
    const latestHealth = m.channels[0]?.healthChecks[0] ?? null;

    return {
      id: m.id,
      name: m.name,
      displayName: m.displayName,
      modality: m.modality,
      enabled: m.enabled,
      canonicalName: m.canonicalName,
      isVariant: m.isVariant,
      maxTokens: m.maxTokens,
      contextWindow: m.contextWindow,
      capabilities: m.capabilities,
      supportedSizes: m.supportedSizes,
      createdAt: m.createdAt,
      channelCount: m.channels.length,
      activeChannelCount: activeChannels.length,
      sellPrice: activeChannels[0]?.sellPrice ?? null,
      healthStatus: latestHealth?.result ?? null,
      healthLatencyMs: latestHealth?.latencyMs ?? null,
      healthCheckedAt: latestHealth?.createdAt ?? null,
      channels: m.channels.map((ch) => ({
        id: ch.id,
        provider: ch.provider.displayName,
        providerName: ch.provider.name,
        status: ch.status,
        priority: ch.priority,
        sellPrice: ch.sellPrice,
        healthResult: ch.healthChecks[0]?.result ?? null,
        healthLatencyMs: ch.healthChecks[0]?.latencyMs ?? null,
      })),
    };
  });

  // Group by canonicalName for variant folding
  const groupMap = new Map<string, { primary: (typeof items)[0]; variants: (typeof items)[0][] }>();

  for (const item of items) {
    const key = item.canonicalName || item.name;
    const existing = groupMap.get(key);
    if (!existing) {
      groupMap.set(key, { primary: item, variants: [] });
    } else if (item.isVariant) {
      existing.variants.push(item);
    } else {
      // Current item is primary, move old primary to variants if it's a variant
      if (existing.primary.isVariant) {
        existing.variants.push(existing.primary);
        existing.primary = item;
      } else {
        existing.variants.push(item);
      }
    }
  }

  const grouped = Array.from(groupMap.values()).map(({ primary, variants }) => ({
    ...primary,
    variants: variants.length > 0 ? variants : undefined,
  }));

  return NextResponse.json({
    data: grouped,
    total: models.length,
    groupCount: grouped.length,
  });
}

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  if (!body.name || !body.displayName || !body.modality) {
    return errorResponse(400, "invalid_parameter", "name, displayName, modality required");
  }

  const model = await prisma.model.create({ data: body });
  return NextResponse.json(model, { status: 201 });
}
