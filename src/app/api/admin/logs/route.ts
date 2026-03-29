import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  const status = url.searchParams.get("status")?.toUpperCase();
  const model = url.searchParams.get("model");
  const projectId = url.searchParams.get("projectId");

  const where = {
    ...(status ? { status: status as "SUCCESS" | "ERROR" | "TIMEOUT" | "FILTERED" } : {}),
    ...(model ? { modelName: model } : {}),
    ...(projectId ? { projectId } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.callLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        project: { select: { name: true } },
        channel: { select: { realModelId: true, provider: { select: { name: true } } } },
      },
    }),
    prisma.callLog.count({ where }),
  ]);

  return NextResponse.json({
    data: data.map((log) => ({
      traceId: log.traceId,
      projectName: log.project.name,
      projectId: log.projectId,
      modelName: log.modelName,
      channelProvider: log.channel.provider.name,
      channelRealModelId: log.channel.realModelId,
      status: log.status,
      finishReason: log.finishReason,
      promptTokens: log.promptTokens,
      completionTokens: log.completionTokens,
      totalTokens: log.totalTokens,
      costPrice: log.costPrice ? Number(log.costPrice) : null,
      sellPrice: log.sellPrice ? Number(log.sellPrice) : null,
      latencyMs: log.latencyMs,
      ttftMs: log.ttftMs,
      createdAt: log.createdAt,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
