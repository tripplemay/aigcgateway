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
  const days = Number(url.searchParams.get("days") ?? 14);
  const since = new Date(Date.now() - days * 86400000);

  const results = await prisma.$queryRaw<Array<{ date: string; calls: bigint; cost: number; tokens: bigint }>>`
    SELECT DATE("createdAt") AS date,
           COUNT(*)::bigint AS calls,
           COALESCE(SUM("sellPrice"), 0)::float AS cost,
           COALESCE(SUM("totalTokens"), 0)::bigint AS tokens
    FROM call_logs
    WHERE "projectId" = ${params.id} AND "createdAt" >= ${since}
    GROUP BY DATE("createdAt")
    ORDER BY date
  `;

  return NextResponse.json({
    data: results.map((r) => ({
      date: String(r.date),
      calls: Number(r.calls),
      cost: r.cost,
      tokens: Number(r.tokens),
    })),
  });
}
