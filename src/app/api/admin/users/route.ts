export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20")));
  const skip = (page - 1) * pageSize;

  const where = { role: "DEVELOPER" as const, deletedAt: null };

  // 并行查询：分页用户 + 总数
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        balance: true,
        createdAt: true,
        projects: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  // 批量查询所有相关 project 的 callLog count（避免 N+1）
  const projectIds = users.flatMap((u) => u.projects.map((p) => p.id));
  const callCounts =
    projectIds.length > 0
      ? await prisma.callLog.groupBy({
          by: ["projectId"],
          where: { projectId: { in: projectIds } },
          _count: { id: true },
        })
      : [];
  const callCountMap = new Map(callCounts.map((c) => [c.projectId, c._count.id]));

  return NextResponse.json({
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      projectCount: u.projects.length,
      totalBalance: Number(u.balance),
      totalCalls: u.projects.reduce((sum, p) => sum + (callCountMap.get(p.id) ?? 0), 0),
      createdAt: u.createdAt,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
