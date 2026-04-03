export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { id: string; templateId: string } };

// GET /api/projects/:id/templates/:templateId — 模板详情
export async function GET(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const template = await prisma.template.findUnique({
    where: { id: params.templateId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  if (!template || template.projectId !== project.id) {
    return errorResponse(404, "not_found", "Template not found");
  }

  return NextResponse.json(template);
}

// PATCH /api/projects/:id/templates/:templateId — 更新模板信息
export async function PATCH(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const existing = await prisma.template.findUnique({ where: { id: params.templateId } });
  if (!existing || existing.projectId !== project.id) {
    return errorResponse(404, "not_found", "Template not found");
  }

  const body = await request.json();
  const { name, description } = body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;

  const updated = await prisma.template.update({
    where: { id: params.templateId },
    data,
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  return NextResponse.json(updated);
}

// DELETE /api/projects/:id/templates/:templateId — 删除模板
export async function DELETE(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const existing = await prisma.template.findUnique({ where: { id: params.templateId } });
  if (!existing || existing.projectId !== project.id) {
    return errorResponse(404, "not_found", "Template not found");
  }

  await prisma.templateVersion.deleteMany({ where: { templateId: params.templateId } });
  await prisma.template.delete({ where: { id: params.templateId } });

  return NextResponse.json({ success: true });
}
