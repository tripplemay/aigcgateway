export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { id: string } };

// GET /api/projects/:id/actions — 列出项目 Actions
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

  const [actions, total] = await Promise.all([
    prisma.action.findMany({
      where,
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.action.count({ where }),
  ]);

  const data = actions.map((a) => {
    const activeVersion = a.versions.find((v) => v.id === a.activeVersionId) ?? a.versions[0] ?? null;
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      model: a.model,
      activeVersionId: a.activeVersionId,
      activeVersion: activeVersion
        ? { id: activeVersion.id, versionNumber: activeVersion.versionNumber }
        : null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  });

  return NextResponse.json({
    data,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

// POST /api/projects/:id/actions — 创建 Action（含首个版本并激活）
export async function POST(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const body = await request.json();
  const { name, description, model, messages, variables, changelog } = body;

  if (!name) return errorResponse(400, "invalid_parameter", "name is required");
  if (!model) return errorResponse(400, "invalid_parameter", "model is required");
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return errorResponse(400, "invalid_parameter", "messages array is required");
  }

  const action = await prisma.action.create({
    data: {
      projectId: project.id,
      name,
      description: description || null,
      model,
    },
  });

  const version = await prisma.actionVersion.create({
    data: {
      actionId: action.id,
      versionNumber: 1,
      messages,
      variables: variables || [],
      changelog: changelog || "初始版本",
    },
  });

  const updated = await prisma.action.update({
    where: { id: action.id },
    data: { activeVersionId: version.id },
    include: { versions: true },
  });

  return NextResponse.json(updated, { status: 201 });
}
