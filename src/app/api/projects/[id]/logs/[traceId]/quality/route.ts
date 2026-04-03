export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { id: string; traceId: string } };

// PATCH /api/projects/:id/logs/:traceId/quality — 回传 qualityScore
export async function PATCH(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const body = await request.json();
  const { score } = body;

  if (typeof score !== "number" || score < 0 || score > 1) {
    return errorResponse(400, "invalid_parameter", "score must be a number between 0.0 and 1.0");
  }

  const log = await prisma.callLog.findFirst({
    where: { traceId: params.traceId, projectId: params.id },
  });
  if (!log) return errorResponse(404, "not_found", "Log not found");

  await prisma.callLog.update({
    where: { id: log.id },
    data: { qualityScore: score },
  });

  return NextResponse.json({ success: true, traceId: params.traceId, qualityScore: score });
}
