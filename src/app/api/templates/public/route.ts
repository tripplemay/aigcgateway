export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";

// GET /api/templates/public — 公共模板列表
export async function GET(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
  const sort = searchParams.get("sort") || "qualityScore";

  const where: Record<string, unknown> = { isPublic: true };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy = buildOrderBy(sort);

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        qualityScore: true,
        updatedAt: true,
        steps: {
          orderBy: { order: "asc" },
          select: { id: true, role: true },
        },
        _count: { select: { forks: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.template.count({ where }),
  ]);

  const data = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    stepCount: t.steps.length,
    executionMode: inferExecutionMode(t.steps),
    qualityScore: t.qualityScore,
    forkCount: t._count.forks,
    updatedAt: t.updatedAt,
  }));

  return NextResponse.json({
    data,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

function buildOrderBy(sort: string): Record<string, string> {
  switch (sort) {
    case "name":
      return { name: "asc" };
    case "updatedAt":
      return { updatedAt: "desc" };
    case "qualityScore":
    default:
      return { qualityScore: "desc" };
  }
}

function inferExecutionMode(steps: { role: string }[]): string {
  if (steps.length <= 1) return "single";
  if (steps.some((s) => s.role === "SPLITTER")) return "fan-out";
  return "sequential";
}
