export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { id: string; templateId: string } };

// PATCH /api/projects/:id/templates/:templateId/active-version — 切换活跃版本
export async function PATCH(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const template = await prisma.template.findUnique({ where: { id: params.templateId } });
  if (!template || template.projectId !== project.id) {
    return errorResponse(404, "not_found", "Template not found");
  }

  const body = await request.json();
  const { versionId } = body;

  if (!versionId) {
    return errorResponse(400, "invalid_parameter", "versionId is required");
  }

  const version = await prisma.templateVersion.findUnique({ where: { id: versionId } });
  if (!version || version.templateId !== params.templateId) {
    return errorResponse(404, "not_found", "Version not found for this template");
  }

  const updated = await prisma.template.update({
    where: { id: params.templateId },
    data: { activeVersionId: versionId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  return NextResponse.json(updated);
}
