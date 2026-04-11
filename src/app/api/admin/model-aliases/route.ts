export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/**
 * GET /api/admin/model-aliases
 * 返回所有别名（含关联模型详情 + 未归类模型列表）
 */
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const [aliases, allModels] = await Promise.all([
    prisma.modelAlias.findMany({
      orderBy: [{ alias: "asc" }],
      include: {
        models: {
          include: {
            model: {
              include: {
                channels: {
                  orderBy: { priority: "asc" },
                  select: {
                    id: true,
                    priority: true,
                    status: true,
                    realModelId: true,
                    costPrice: true,
                    provider: { select: { name: true, displayName: true } },
                    healthChecks: {
                      orderBy: { createdAt: "desc" },
                      take: 1,
                      select: { latencyMs: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.model.findMany({
      where: {
        aliasLinks: { none: {} },
        channels: { some: { status: "ACTIVE" } },
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        modality: true,
        channels: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            provider: { select: { name: true, displayName: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const data = aliases.map((a) => ({
    id: a.id,
    alias: a.alias,
    brand: a.brand,
    modality: a.modality,
    enabled: a.enabled,
    contextWindow: a.contextWindow,
    maxTokens: a.maxTokens,
    capabilities: a.capabilities,
    description: a.description,
    sellPrice: a.sellPrice,
    openRouterModelId: a.openRouterModelId ?? null,
    linkedModels: a.models.map((link) => ({
      modelId: link.model.id,
      modelName: link.model.name,
      channels: link.model.channels.map((ch) => ({
        id: ch.id,
        priority: ch.priority,
        status: ch.status,
        costPrice: ch.costPrice as Record<string, unknown> | null,
        providerName: ch.provider.displayName,
        latencyMs: ch.healthChecks[0]?.latencyMs ?? null,
      })),
    })),
    linkedModelCount: a.models.length,
    activeChannelCount: a.models.reduce(
      (sum, link) => sum + link.model.channels.filter((ch) => ch.status === "ACTIVE").length,
      0,
    ),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));

  const unlinkedModels = allModels.map((m) => ({
    id: m.id,
    name: m.name,
    displayName: m.displayName,
    modality: m.modality,
    channelCount: m.channels.length,
    providers: [...new Set(m.channels.map((ch) => ch.provider.displayName))],
  }));

  return NextResponse.json({
    data,
    total: data.length,
    unlinkedModels,
    unlinkedCount: unlinkedModels.length,
  });
}

/**
 * POST /api/admin/model-aliases
 * 创建别名 { alias, brand?, modality?, description? }
 */
export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { alias, brand, modality, description, contextWindow, maxTokens } = body;

  if (!alias) {
    return errorResponse(400, "invalid_parameter", "alias is required");
  }

  const existing = await prisma.modelAlias.findUnique({ where: { alias } });
  if (existing) {
    return errorResponse(409, "conflict", `Alias "${alias}" already exists`);
  }

  const created = await prisma.modelAlias.create({
    data: {
      alias,
      ...(brand != null ? { brand } : {}),
      ...(modality != null ? { modality } : {}),
      ...(description != null ? { description } : {}),
      ...(contextWindow != null ? { contextWindow } : {}),
      ...(maxTokens != null ? { maxTokens } : {}),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
