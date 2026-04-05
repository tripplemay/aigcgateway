export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { id: string; actionId: string } };

// GET /api/projects/:id/actions/:actionId/versions — 版本列表
export async function GET(request: Request, { params }: Params) {
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

  const versions = await prisma.actionVersion.findMany({
    where: { actionId: params.actionId },
    orderBy: { versionNumber: "desc" },
  });

  return NextResponse.json({ data: versions, activeVersionId: action.activeVersionId });
}

// POST /api/projects/:id/actions/:actionId/versions — 新建版本
export async function POST(request: Request, { params }: Params) {
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
  const { messages, variables, changelog } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return errorResponse(400, "invalid_parameter", "messages array is required");
  }

  // Get next version number
  const lastVersion = await prisma.actionVersion.findFirst({
    where: { actionId: params.actionId },
    orderBy: { versionNumber: "desc" },
  });
  const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;

  const version = await prisma.actionVersion.create({
    data: {
      actionId: params.actionId,
      versionNumber: nextVersion,
      messages,
      variables: variables || [],
      changelog: changelog || null,
    },
  });

  return NextResponse.json(version, { status: 201 });
}
