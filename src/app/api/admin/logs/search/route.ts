import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Number(url.searchParams.get("pageSize") ?? 20));

  if (!q) return errorResponse(400, "invalid_parameter", "q is required");

  const tsQuery = q.split(/\s+/).filter(Boolean).join(" & ");

  const results = await prisma.$queryRaw<Array<{ id: string; traceId: string; modelName: string; status: string; createdAt: Date }>>`
    SELECT id, "traceId", "modelName", status, "createdAt"
    FROM call_logs
    WHERE search_vector @@ to_tsquery('simple', ${tsQuery})
    ORDER BY "createdAt" DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;

  return NextResponse.json({ data: results });
}
