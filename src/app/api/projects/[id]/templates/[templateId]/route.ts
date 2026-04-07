export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";
import type { StepRole } from "@prisma/client";

type Params = { params: { id: string; templateId: string } };

// GET /api/projects/:id/templates/:templateId — Template 详情
export async function GET(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const template = await prisma.template.findFirst({
    where: { id: params.templateId, projectId: project.id },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: { action: { select: { id: true, name: true, model: true, description: true } } },
      },
    },
  });
  if (!template) return errorResponse(404, "not_found", "Template not found");

  return NextResponse.json(template);
}

// PUT /api/projects/:id/templates/:templateId — 更新 Template（含 steps：先删后建）
export async function PUT(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const existing = await prisma.template.findFirst({
    where: { id: params.templateId, projectId: project.id },
  });
  if (!existing) return errorResponse(404, "not_found", "Template not found");

  const body = await request.json();
  const { name, description, steps } = body;

  // If steps provided, validate action ownership
  if (steps && Array.isArray(steps)) {
    for (const s of steps as { actionId?: string; order?: number }[]) {
      if (!s.actionId)
        return errorResponse(400, "invalid_parameter", "Each step must have an actionId");
      if (typeof s.order !== "number")
        return errorResponse(400, "invalid_parameter", "Each step must have a numeric order");
    }
    const orders = steps.map((s: { order: number }) => s.order);
    if (new Set(orders).size !== orders.length) {
      return errorResponse(400, "invalid_parameter", "Duplicate step order values");
    }

    const actionIds = [...new Set(steps.map((s: { actionId: string }) => s.actionId))];
    const actions = await prisma.action.findMany({
      where: { id: { in: actionIds as string[] }, projectId: project.id },
    });
    if (actions.length !== actionIds.length) {
      return errorResponse(400, "invalid_parameter", "One or more actionIds are invalid");
    }
  }

  try {
    if (steps && Array.isArray(steps)) {
      // Delete existing steps and recreate
      await prisma.templateStep.deleteMany({ where: { templateId: params.templateId } });
      await prisma.templateStep.createMany({
        data: steps.map((s: { actionId: string; order: number; role?: string }) => ({
          templateId: params.templateId,
          actionId: s.actionId,
          order: s.order,
          role: (s.role || "SEQUENTIAL") as StepRole,
        })),
      });
    }

    const updated = await prisma.template.update({
      where: { id: params.templateId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: { action: { select: { id: true, name: true, model: true } } },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Template update failed";
    return errorResponse(500, "internal_error", msg);
  }
}

// DELETE /api/projects/:id/templates/:templateId — 删除 Template（级联删除 steps）
export async function DELETE(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const existing = await prisma.template.findFirst({
    where: { id: params.templateId, projectId: project.id },
  });
  if (!existing) return errorResponse(404, "not_found", "Template not found");

  await prisma.template.delete({ where: { id: params.templateId } });
  return NextResponse.json({ deleted: true });
}
