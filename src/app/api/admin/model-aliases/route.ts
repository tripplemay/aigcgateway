export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/**
 * GET /api/admin/model-aliases
 * 返回所有别名，按 modelName 分组
 */
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const aliases = await prisma.modelAlias.findMany({
    orderBy: [{ modelName: "asc" }, { alias: "asc" }],
  });

  // Group by modelName
  const grouped: Record<string, { id: string; alias: string; createdAt: Date }[]> = {};
  for (const a of aliases) {
    if (!grouped[a.modelName]) grouped[a.modelName] = [];
    grouped[a.modelName].push({ id: a.id, alias: a.alias, createdAt: a.createdAt });
  }

  return NextResponse.json({ data: grouped, total: aliases.length });
}

/**
 * POST /api/admin/model-aliases
 * 创建别名 { alias, modelName }
 */
export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { alias, modelName } = body;

  if (!alias || !modelName) {
    return errorResponse(400, "invalid_parameter", "alias and modelName required");
  }

  // Check uniqueness
  const existing = await prisma.modelAlias.findUnique({ where: { alias } });
  if (existing) {
    return errorResponse(409, "conflict", `Alias "${alias}" already exists`);
  }

  const created = await prisma.modelAlias.create({
    data: { alias, modelName },
  });

  return NextResponse.json(created, { status: 201 });
}
