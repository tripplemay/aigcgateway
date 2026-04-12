export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";
import { escapeJsonStrings } from "@/lib/api/sanitize-html";

export async function GET(
  request: Request,
  { params }: { params: { id: string; traceId: string } },
) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const log = await prisma.callLog.findFirst({
    where: { traceId: params.traceId, projectId: params.id },
  });

  if (!log) return errorResponse(404, "not_found", "Log not found");

  return NextResponse.json({
    traceId: log.traceId,
    modelName: log.modelName,
    status: log.status,
    finishReason: log.finishReason,
    promptSnapshot: escapeJsonStrings(log.promptSnapshot),
    requestParams: log.requestParams,
    responseContent:
      typeof log.responseContent === "string"
        ? escapeJsonStrings(log.responseContent)
        : escapeJsonStrings(log.responseContent),
    promptTokens: log.promptTokens,
    completionTokens: log.completionTokens,
    totalTokens: log.totalTokens,
    sellPrice: log.sellPrice ? Number(log.sellPrice) : null,
    latencyMs: log.latencyMs,
    ttftMs: log.ttftMs,
    tokensPerSecond: log.tokensPerSecond,
    errorMessage: log.errorMessage,
    createdAt: log.createdAt,
  });
}
