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
  const q = url.searchParams.get("q");
  if (!q) return errorResponse(400, "invalid_parameter", "q is required");

  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Number(url.searchParams.get("pageSize") ?? 20));
  const tsQuery = q.split(/\s+/).filter(Boolean).join(" & ");

  const results = await prisma.$queryRaw<Array<{
    traceId: string; modelName: string; status: string; sellPrice: number | null;
    latencyMs: number | null; totalTokens: number | null; createdAt: Date;
  }>>`
    SELECT "traceId", "modelName", status, "sellPrice"::float, "latencyMs", "totalTokens", "createdAt"
    FROM call_logs
    WHERE "projectId" = ${params.id} AND search_vector @@ to_tsquery('simple', ${tsQuery})
    ORDER BY "createdAt" DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;

  return NextResponse.json({ data: results });
}
