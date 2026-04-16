export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { templateId: string } };

// GET /api/templates/public/:templateId — 公共模板详情
export async function GET(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const template = await prisma.template.findFirst({
    where: { id: params.templateId, isPublic: true },
    select: {
      id: true,
      name: true,
      description: true,
      qualityScore: true,
      updatedAt: true,
      steps: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          role: true,
          action: { select: { id: true, name: true, model: true, description: true } },
        },
      },
      _count: { select: { forks: true } },
    },
  });

  if (!template) return errorResponse(404, "not_found", "Public template not found");

  const data = {
    id: template.id,
    name: template.name,
    description: template.description,
    qualityScore: template.qualityScore,
    forkCount: template._count.forks,
    executionMode: inferExecutionMode(template.steps),
    updatedAt: template.updatedAt,
    // F-AF2-08: redact cross-tenant actionId for public templates
    steps: template.steps.map((s) => ({
      id: s.id,
      order: s.order,
      role: s.role,
      actionName: s.action.name,
      actionModel: s.action.model,
      actionDescription: s.action.description,
    })),
  };

  return NextResponse.json(data);
}

function inferExecutionMode(steps: { role: string }[]): string {
  if (steps.length <= 1) return "single";
  if (steps.some((s) => s.role === "SPLITTER")) return "fan-out";
  return "sequential";
}
