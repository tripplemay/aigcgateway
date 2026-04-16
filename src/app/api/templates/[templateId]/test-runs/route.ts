export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { templateId: string } };

// GET /api/templates/:templateId/test-runs
// Returns latest 20 summary records for the authenticated user.
export async function GET(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const template = await prisma.template.findUnique({
    where: { id: params.templateId },
    include: { project: { select: { userId: true } } },
  });
  if (!template) {
    return errorResponse(404, "not_found", "Template not found");
  }
  if (template.project.userId !== auth.payload.userId) {
    return errorResponse(403, "forbidden", "You do not have access to this template's tests");
  }

  const runs = await prisma.templateTestRun.findMany({
    where: { templateId: params.templateId, userId: auth.payload.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      mode: true,
      status: true,
      totalTokens: true,
      totalCost: true,
      totalLatency: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    data: runs.map((r) => ({
      id: r.id,
      mode: r.mode,
      status: r.status,
      totalTokens: r.totalTokens,
      totalCost: r.totalCost?.toString() ?? null,
      totalLatency: r.totalLatency,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
