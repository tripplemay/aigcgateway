export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";


export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({ where: { id: params.id, userId: auth.payload.userId } });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "7d";
  const days = period === "today" ? 1 : period === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 86400000);

  const agg = await prisma.callLog.aggregate({
    where: { projectId: params.id, createdAt: { gte: since } },
    _count: true,
    _sum: { totalTokens: true, sellPrice: true },
    _avg: { latencyMs: true, ttftMs: true },
  });

  const successCount = await prisma.callLog.count({
    where: { projectId: params.id, createdAt: { gte: since }, status: "SUCCESS" },
  });
  const errorCount = await prisma.callLog.count({
    where: { projectId: params.id, createdAt: { gte: since }, status: { in: ["ERROR", "TIMEOUT"] } },
  });

  return NextResponse.json({
    period,
    totalCalls: agg._count,
    totalTokens: agg._sum.totalTokens ?? 0,
    totalCost: Number(agg._sum.sellPrice ?? 0),
    avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
    avgTtftMs: Math.round(agg._avg.ttftMs ?? 0),
    successRate: agg._count > 0 ? successCount / agg._count : 1,
    errorCount,
  });
}
