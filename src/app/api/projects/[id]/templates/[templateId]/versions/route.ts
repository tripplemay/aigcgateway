export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { id: string; templateId: string } };

// POST /api/projects/:id/templates/:templateId/versions — 创建新版本
export async function POST(request: Request, { params }: Params) {
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
  const { messages, variables, changelog } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return errorResponse(400, "invalid_parameter", "messages array is required");
  }
  if (!variables || !Array.isArray(variables)) {
    return errorResponse(400, "invalid_parameter", "variables array is required");
  }

  const latest = await prisma.templateVersion.findFirst({
    where: { templateId: params.templateId },
    orderBy: { versionNumber: "desc" },
  });

  const version = await prisma.templateVersion.create({
    data: {
      templateId: params.templateId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      messages,
      variables,
      changelog: changelog || null,
    },
  });

  return NextResponse.json(version, { status: 201 });
}
