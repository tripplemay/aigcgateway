export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import { ZodError } from "zod";
import type { Prisma } from "@prisma/client";
import {
  modelCreateSchema,
  zodErrorResponse,
  mapJsonNulls,
  MODEL_JSON_FIELDS,
} from "@/lib/api/admin-schemas";

/**
 * GET /api/admin/models
 *
 * 返回全量模型（含 enabled/channels/health 信息）
 * 支持 provider/modality/search 筛选
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
      maxTokens: m.maxTokens,
      contextWindow: m.contextWindow,
      capabilities: m.capabilities,
      supportedSizes: m.supportedSizes,
      createdAt: m.createdAt,
      channelCount: m.channels.length,
      activeChannelCount: activeChannels.length,
      healthStatus: latestHealth?.result ?? null,
      healthLatencyMs: latestHealth?.latencyMs ?? null,
      healthCheckedAt: latestHealth?.createdAt ?? null,
      channels: m.channels.map((ch) => ({
        id: ch.id,
        provider: ch.provider.displayName,
        providerName: ch.provider.name,
        status: ch.status,
        priority: ch.priority,
        costPrice: ch.costPrice,
        healthResult: ch.healthChecks[0]?.result ?? null,
        healthLatencyMs: ch.healthChecks[0]?.latencyMs ?? null,
      })),
    };
  });

  return NextResponse.json({
    data: items,
    total: models.length,
  });
}

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();

  // F-IG-01: strict zod whitelist — rejects projectId, id, foreign fields.
  let data;
  try {
    data = modelCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err);
    throw err;
  }

  const model = await prisma.model.create({
    data: mapJsonNulls(data, MODEL_JSON_FIELDS) as unknown as Prisma.ModelCreateInput,
  });
  return NextResponse.json(model, { status: 201 });
}
