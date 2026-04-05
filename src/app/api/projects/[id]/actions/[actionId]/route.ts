export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { id: string; actionId: string } };

// GET /api/projects/:id/actions/:actionId — Action 详情（含所有版本）
export async function GET(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const action = await prisma.action.findFirst({
    where: { id: params.actionId, projectId: project.id },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (!action) return errorResponse(404, "not_found", "Action not found");

  return NextResponse.json(action);
}

// PUT /api/projects/:id/actions/:actionId — 更新 Action 基础信息
export async function PUT(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const existing = await prisma.action.findFirst({
    where: { id: params.actionId, projectId: project.id },
  });
  if (!existing) return errorResponse(404, "not_found", "Action not found");

  const body = await request.json();
  const { name, description, model } = body;

  const updated = await prisma.action.update({
    where: { id: params.actionId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(model !== undefined ? { model } : {}),
    },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  return NextResponse.json(updated);
}

// DELETE /api/projects/:id/actions/:actionId — 删除 Action
export async function DELETE(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const existing = await prisma.action.findFirst({
    where: { id: params.actionId, projectId: project.id },
  });
  if (!existing) return errorResponse(404, "not_found", "Action not found");

  // Check if action is used in any template steps
  const usedInSteps = await prisma.templateStep.count({
    where: { actionId: params.actionId },
  });
  if (usedInSteps > 0) {
    return errorResponse(
      409,
      "conflict",
      `Action is used in ${usedInSteps} template step(s). Remove it from templates first.`,
    );
  }

  await prisma.action.delete({ where: { id: params.actionId } });
  return NextResponse.json({ deleted: true });
}
