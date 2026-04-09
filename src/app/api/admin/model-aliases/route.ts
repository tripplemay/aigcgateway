export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/**
 * GET /api/admin/model-aliases
 * 返回所有别名（含关联模型数）
 * F-M1a-02 会增强为完整 CRUD + 模型挂载
 */
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const aliases = await prisma.modelAlias.findMany({
    orderBy: [{ alias: "asc" }],
    include: {
      models: {
        include: {
          model: {
            include: {
              channels: { where: { status: "ACTIVE" }, select: { id: true } },
            },
          },
        },
      },
    },
  });

  const data = aliases.map((a) => ({
    id: a.id,
    alias: a.alias,
    brand: a.brand,
    modality: a.modality,
    enabled: a.enabled,
    contextWindow: a.contextWindow,
    maxTokens: a.maxTokens,
    description: a.description,
    linkedModelCount: a.models.length,
    activeChannelCount: a.models.reduce(
      (sum, link) => sum + link.model.channels.length,
      0,
    ),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));

  return NextResponse.json({ data, total: data.length });
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
