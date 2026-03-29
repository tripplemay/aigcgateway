import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

const prisma = new PrismaClient();

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({ where: { id: params.id, userId: auth.payload.userId } });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  const status = url.searchParams.get("status")?.toUpperCase();
  const model = url.searchParams.get("model");

  const where = {
    projectId: params.id,
    ...(status ? { status: status as "SUCCESS" | "ERROR" | "TIMEOUT" | "FILTERED" } : {}),
    ...(model ? { modelName: model } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.callLog.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
    }),
    prisma.callLog.count({ where }),
  ]);

  return NextResponse.json({
    data: data.map((l) => ({
      traceId: l.traceId, modelName: l.modelName, status: l.status,
      finishReason: l.finishReason, promptTokens: l.promptTokens,
      completionTokens: l.completionTokens, totalTokens: l.totalTokens,
      sellPrice: l.sellPrice ? Number(l.sellPrice) : null,
      latencyMs: l.latencyMs, ttftMs: l.ttftMs, tokensPerSecond: l.tokensPerSecond,
      createdAt: l.createdAt,
      promptPreview: extractPreview(l.promptSnapshot),
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

function extractPreview(snapshot: unknown): string {
  if (!Array.isArray(snapshot)) return "";
  const last = snapshot.findLast((m: Record<string, unknown>) => m.role === "user");
  const content = last?.content;
  if (typeof content === "string") return content.slice(0, 100);
  return "";
}
