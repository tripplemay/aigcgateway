import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const results = await prisma.$queryRaw<Array<{
    model_name: string;
    calls: bigint;
    tokens: bigint;
    cost: number;
    revenue: number;
    avg_latency: number;
  }>>`
    SELECT "modelName" AS model_name,
           COUNT(*)::bigint AS calls,
           COALESCE(SUM("totalTokens"), 0)::bigint AS tokens,
           COALESCE(SUM("costPrice"), 0)::float AS cost,
           COALESCE(SUM("sellPrice"), 0)::float AS revenue,
           COALESCE(AVG("latencyMs"), 0)::float AS avg_latency
    FROM call_logs
    GROUP BY "modelName"
    ORDER BY revenue DESC
  `;

  return NextResponse.json({
    data: results.map((r) => ({
      model: r.model_name,
      calls: Number(r.calls),
      tokens: Number(r.tokens),
      cost: r.cost,
      revenue: r.revenue,
      avgLatency: Math.round(r.avg_latency),
    })),
  });
}
