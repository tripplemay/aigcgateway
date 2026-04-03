export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

// GET /api/admin/templates — 列出所有平台公共模板
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));

  const where: Record<string, unknown> = { projectId: null };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }
  if (category) {
    where.category = category;
  }

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        _count: { select: { versions: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.template.count({ where }),
  ]);

  return NextResponse.json({
    data: templates.map((t) => ({
      ...t,
      versionCount: t._count.versions,
      _count: undefined,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

// POST /api/admin/templates — 创建平台公共模板
export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { name, description, category, messages, variables } = body;

  if (!name) {
    return errorResponse(400, "invalid_parameter", "name is required");
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return errorResponse(400, "invalid_parameter", "messages array is required");
  }
  if (!variables || !Array.isArray(variables)) {
    return errorResponse(400, "invalid_parameter", "variables array is required");
  }

  const template = await prisma.template.create({
    data: {
      projectId: null,
      name,
      description: description || null,
      category: category || null,
      createdBy: auth.payload.userId,
    },
  });

  const version = await prisma.templateVersion.create({
    data: {
      templateId: template.id,
      versionNumber: 1,
      messages,
      variables,
      changelog: "初始版本",
    },
  });

  const updated = await prisma.template.update({
    where: { id: template.id },
    data: { activeVersionId: version.id },
    include: { versions: true },
  });

  return NextResponse.json(updated, { status: 201 });
}
