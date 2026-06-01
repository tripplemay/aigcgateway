export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";
import { sanitizeErrorMessage } from "@/lib/engine/types";
import { buildProxyUrl, resolveRequestOrigin } from "@/lib/api/image-proxy";

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

  // F-AF-02: surface reasoning_tokens stored in responseSummary.
  const summary = log.responseSummary as Record<string, unknown> | null;
  const reasoningRaw = summary?.reasoning_tokens;
  const reasoningTokens =
    typeof reasoningRaw === "number" && reasoningRaw > 0 ? reasoningRaw : null;

  // BL-IMG-PERSIST-GCS F-IGP-04: when the call persisted images, sign a fresh
  // same-origin proxy URL per image (server-side — the client cannot HMAC) so
  // the log detail page can render real <img> previews instead of the
  // [image:fmt, NKB] metadata. Index-aligned with original_urls; empty/null
  // entries are skipped. Works for GCS keys and legacy http upstreams alike
  // (the proxy route resolves either).
  const originalUrls = Array.isArray(summary?.original_urls) ? summary.original_urls : [];
  // fix_round 1: forwarded-header origin (request.url = internal 0.0.0.0 bind).
  const origin = resolveRequestOrigin(request);
  const images = originalUrls
    .map((u, idx) =>
      typeof u === "string" && u.length > 0 ? buildProxyUrl(log.traceId, idx, origin) : null,
    )
    .filter((u): u is string => typeof u === "string");

  return NextResponse.json({
    traceId: log.traceId,
    modelName: log.modelName,
    status: log.status,
    finishReason: log.finishReason,
    // F-AF2-05: return raw strings — React auto-escapes in the frontend.
    // HTML entity encoding here corrupts API responses (&#x27; instead of ').
    promptSnapshot: log.promptSnapshot,
    requestParams: log.requestParams,
    responseContent: log.responseContent,
    promptTokens: log.promptTokens,
    completionTokens: log.completionTokens,
    totalTokens: log.totalTokens,
    reasoningTokens,
    sellPrice: log.sellPrice ? Number(log.sellPrice) : null,
    latencyMs: log.latencyMs,
    ttftMs: log.ttftMs,
    tokensPerSecond: log.tokensPerSecond,
    errorMessage: log.errorMessage ? sanitizeErrorMessage(log.errorMessage) : null,
    images,
    createdAt: log.createdAt,
  });
}
