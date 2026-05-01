export const dynamic = "force-dynamic";
import { Prisma, type ModelModality } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/**
 * GET /api/admin/model-aliases
 *
 * BL-ADMIN-ALIAS-UX-PHASE1 F-AAU-08: server-side pagination + filtering.
 * Query params (all optional):
 *   page (default 1, min 1)
 *   pageSize (default 20, min 1, max 100)
 *   search (alias / description contains, mode insensitive)
 *   brand (exact match)
 *   modality (exact match against ModelModality enum)
 *   enabled ('true' | 'false')
 *   sortKey ('alias' | 'enabled' | 'updatedAt'; default 'alias')
 *
 * Response: { data, unlinkedModels, availableBrands, pagination }
 *   - data: AliasItem[] for the current page
 *   - unlinkedModels: full list (small N, no point paginating)
 *   - availableBrands: distinct brand values across **all** aliases
 *     (so the brand filter dropdown shows every option, not only those
 *     present on the current page)
 *   - pagination: { page, pageSize, total, totalPages } reflects the
 *     **filtered** set; total = matching aliases regardless of page
 */
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  // Page: missing or non-numeric → 1; numeric clamps to ≥1.
  const rawPage = Number(url.searchParams.get("page"));
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  // pageSize: missing → 20; non-numeric → 20; 0/negative → 1; >100 → 100.
  const pageSizeParam = url.searchParams.get("pageSize");
  const rawPageSize = pageSizeParam == null ? 20 : Number(pageSizeParam);
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(100, Math.max(1, Math.floor(rawPageSize)))
    : 20;
  const search = (url.searchParams.get("search") ?? "").trim();
  const brand = (url.searchParams.get("brand") ?? "").trim();
  const modality = (url.searchParams.get("modality") ?? "").trim();
  const enabledFilter = url.searchParams.get("enabled");
  const sortKey = url.searchParams.get("sortKey") ?? "alias";

  const where: Prisma.ModelAliasWhereInput = {
    ...(search
      ? {
          OR: [
            { alias: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(brand ? { brand } : {}),
    ...(modality ? { modality: modality as ModelModality } : {}),
    ...(enabledFilter === "true"
      ? { enabled: true }
      : enabledFilter === "false"
        ? { enabled: false }
        : {}),
  };

  const orderBy: Prisma.ModelAliasOrderByWithRelationInput[] =
    sortKey === "enabled"
      ? [{ enabled: "desc" }, { alias: "asc" }]
      : sortKey === "updatedAt"
        ? [{ updatedAt: "desc" }]
        : [{ alias: "asc" }];

  const [aliases, total, allModels, brandRows] = await Promise.all([
    prisma.modelAlias.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        models: {
          include: {
            model: {
              select: {
                id: true,
                name: true,
                enabled: true,
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
                      select: { latencyMs: true, result: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.modelAlias.count({ where }),
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
    // Distinct brand list across the *unfiltered* alias table so the
    // brand dropdown stays complete after pagination/filtering kicks in.
    prisma.modelAlias.findMany({
      where: { brand: { not: null } },
      select: { brand: true },
      distinct: ["brand"],
      orderBy: { brand: "asc" },
    }),
  ]);

  const data = aliases.map((a) => {
    return {
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
        modelEnabled: link.model.enabled,
        channels: link.model.channels.map((ch) => ({
          id: ch.id,
          priority: ch.priority,
          status: ch.status,
          costPrice: ch.costPrice as Record<string, unknown> | null,
          providerName: ch.provider.displayName,
          latencyMs: ch.healthChecks[0]?.latencyMs ?? null,
          lastHealthResult: (ch.healthChecks[0]?.result ?? null) as "PASS" | "FAIL" | null,
        })),
      })),
      linkedModelCount: a.models.length,
      activeChannelCount: a.models.reduce(
        (sum, link) => sum + link.model.channels.filter((ch) => ch.status === "ACTIVE").length,
        0,
      ),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  });

  const unlinkedModels = allModels.map((m) => ({
    id: m.id,
    name: m.name,
    displayName: m.displayName,
    modality: m.modality,
    channelCount: m.channels.length,
    providers: [...new Set(m.channels.map((ch) => ch.provider.displayName))],
  }));

  const availableBrands = brandRows
    .map((r) => r.brand)
    .filter((b): b is string => !!b);

  return NextResponse.json({
    data,
    unlinkedModels,
    availableBrands,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
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
