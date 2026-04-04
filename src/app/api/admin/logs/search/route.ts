export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Number(url.searchParams.get("pageSize") ?? 20));

  if (!q) return errorResponse(400, "invalid_parameter", "q is required");

  const likePattern = `%${q}%`;

  const results = await prisma.$queryRaw<
    Array<{
      traceId: string;
      projectName: string;
      projectId: string;
      modelName: string;
      channelId: string;
      channelProvider: string;
      channelRealModelId: string;
      status: string;
      promptTokens: number | null;
      completionTokens: number | null;
      costPrice: number | null;
      sellPrice: number | null;
      latencyMs: number | null;
      createdAt: Date;
    }>
  >`
    SELECT cl."traceId", p.name AS "projectName", cl."projectId", cl."modelName",
           ch.id AS "channelId", prov.name AS "channelProvider", ch."realModelId" AS "channelRealModelId",
           cl.status, cl."promptTokens", cl."completionTokens",
           cl."costPrice"::float, cl."sellPrice"::float, cl."latencyMs",
           cl."createdAt"
    FROM call_logs cl
    JOIN projects p ON cl."projectId" = p.id
    LEFT JOIN channels ch ON cl."channelId" = ch.id
    LEFT JOIN providers prov ON ch."providerId" = prov.id
    WHERE cl."traceId" ILIKE ${likePattern} OR cl."modelName" ILIKE ${likePattern} OR p.name ILIKE ${likePattern}
    ORDER BY cl."createdAt" DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;

  return NextResponse.json({ data: results });
}
