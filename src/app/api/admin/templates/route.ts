export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

// GET /api/admin/templates — Admin: list all templates across all projects
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const [templates, total, actionCount] = await Promise.all([
    prisma.template.findMany({
      where,
      include: {
        project: { select: { name: true } },
        steps: {
          orderBy: { order: "asc" },
          include: { action: { select: { name: true, model: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.template.count({ where }),
    prisma.action.count(),
  ]);

  const data = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    projectName: t.project.name,
    projectId: t.projectId,
    stepCount: t.steps.length,
    executionMode: t.steps.some((s) => s.role === "SPLITTER")
      ? "fan-out"
      : t.steps.length > 1
        ? "sequential"
        : "single",
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  return NextResponse.json({
    data,
    stats: { totalTemplates: total, totalActions: actionCount },
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
