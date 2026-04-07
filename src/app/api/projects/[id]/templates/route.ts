export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";
import type { StepRole } from "@prisma/client";

type Params = { params: { id: string } };

// GET /api/projects/:id/templates — 列出项目 Templates
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
        steps: {
          orderBy: { order: "asc" },
          include: { action: { select: { id: true, name: true, model: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.template.count({ where }),
  ]);

  const data = templates.map((t) => ({
    ...t,
    stepCount: t.steps.length,
    executionMode: inferExecutionMode(t.steps),
  }));

  return NextResponse.json({
    data,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

// POST /api/projects/:id/templates — 创建 Template（含 steps）
export async function POST(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const body = await request.json();
  const { name, description, steps } = body;

  if (!name) return errorResponse(400, "invalid_parameter", "name is required");
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return errorResponse(400, "invalid_parameter", "steps array is required");
  }

  // Validate each step has actionId and a numeric order
  for (const s of steps as { actionId?: string; order?: number }[]) {
    if (!s.actionId)
      return errorResponse(400, "invalid_parameter", "Each step must have an actionId");
    if (typeof s.order !== "number")
      return errorResponse(400, "invalid_parameter", "Each step must have a numeric order");
  }

  // Validate no duplicate orders
  const orders = steps.map((s: { order: number }) => s.order);
  if (new Set(orders).size !== orders.length) {
    return errorResponse(400, "invalid_parameter", "Duplicate step order values");
  }

  // Validate all referenced actions exist and belong to this project
  const actionIds = [...new Set(steps.map((s: { actionId: string }) => s.actionId))];
  const actions = await prisma.action.findMany({
    where: { id: { in: actionIds as string[] }, projectId: project.id },
  });
  if (actions.length !== actionIds.length) {
    return errorResponse(400, "invalid_parameter", "One or more actionIds are invalid");
  }

  try {
    const template = await prisma.template.create({
      data: {
        projectId: project.id,
        name,
        description: description || null,
        steps: {
          create: steps.map((s: { actionId: string; order: number; role?: string }, i: number) => ({
            actionId: s.actionId,
            order: s.order ?? i,
            role: (s.role || "SEQUENTIAL") as StepRole,
          })),
        },
      },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: { action: { select: { id: true, name: true, model: true } } },
        },
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Template creation failed";
    return errorResponse(500, "internal_error", msg);
  }
}

function inferExecutionMode(steps: { role: string }[]): string {
  if (steps.length <= 1) return "single";
  if (steps.some((s) => s.role === "SPLITTER")) return "fan-out";
  return "sequential";
}
