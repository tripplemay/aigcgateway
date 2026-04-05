export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { id: string; actionId: string } };

// PUT /api/projects/:id/actions/:actionId/active-version — 激活指定版本
export async function PUT(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const action = await prisma.action.findFirst({
    where: { id: params.actionId, projectId: project.id },
  });
  if (!action) return errorResponse(404, "not_found", "Action not found");

  const body = await request.json();
  const { versionId } = body;

  if (!versionId) return errorResponse(400, "invalid_parameter", "versionId is required");

  const version = await prisma.actionVersion.findFirst({
    where: { id: versionId, actionId: params.actionId },
  });
  if (!version) return errorResponse(404, "not_found", "Version not found");

  const updated = await prisma.action.update({
    where: { id: params.actionId },
    data: { activeVersionId: versionId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  return NextResponse.json(updated);
}
