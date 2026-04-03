export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { id: string } };

// GET /api/projects/:id/templates — 列出项目模板
export async function GET(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));

  const where: Record<string, unknown> = { projectId: project.id };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
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

// POST /api/projects/:id/templates — 创建项目模板
export async function POST(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const body = await request.json();
  const { name, description, messages, variables } = body;

  if (!name) return errorResponse(400, "invalid_parameter", "name is required");
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return errorResponse(400, "invalid_parameter", "messages array is required");
  }
  if (!variables || !Array.isArray(variables)) {
    return errorResponse(400, "invalid_parameter", "variables array is required");
  }

  const template = await prisma.template.create({
    data: {
      projectId: project.id,
      name,
      description: description || null,
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
