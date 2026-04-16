export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { templateId: string; runId: string } };

// GET /api/templates/:templateId/test-runs/:runId — full detail (steps + variables)
export async function GET(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const run = await prisma.templateTestRun.findUnique({
    where: { id: params.runId },
    select: {
      id: true,
      templateId: true,
      userId: true,
      variables: true,
      mode: true,
      status: true,
      steps: true,
      totalTokens: true,
      totalCost: true,
      totalLatency: true,
      createdAt: true,
    },
  });

  if (!run) {
    return errorResponse(404, "not_found", "Test run not found");
  }
  if (run.templateId !== params.templateId) {
    return errorResponse(404, "not_found", "Test run not found");
  }
  if (run.userId !== auth.payload.userId) {
    return errorResponse(403, "forbidden", "You do not have access to this test run");
  }

  return NextResponse.json({
    data: {
      id: run.id,
      templateId: run.templateId,
      variables: run.variables,
      mode: run.mode,
      status: run.status,
      steps: run.steps,
      totalTokens: run.totalTokens,
      totalCost: run.totalCost?.toString() ?? null,
      totalLatency: run.totalLatency,
      createdAt: run.createdAt.toISOString(),
    },
  });
}
