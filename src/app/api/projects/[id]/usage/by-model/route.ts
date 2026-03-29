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

  const results = await prisma.$queryRaw<Array<{
    model_name: string; calls: bigint; tokens: bigint; cost: number; avg_latency: number;
  }>>`
    SELECT "modelName" AS model_name,
           COUNT(*)::bigint AS calls,
           COALESCE(SUM("totalTokens"), 0)::bigint AS tokens,
           COALESCE(SUM("sellPrice"), 0)::float AS cost,
           COALESCE(AVG("latencyMs"), 0)::float AS avg_latency
    FROM call_logs WHERE "projectId" = ${params.id}
    GROUP BY "modelName" ORDER BY cost DESC
  `;

  return NextResponse.json({
    data: results.map((r) => ({
      model: r.model_name, calls: Number(r.calls), tokens: Number(r.tokens),
      cost: r.cost, avgLatency: Math.round(r.avg_latency),
    })),
  });
}
