export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/** GET /api/admin/users/:id — 用户详情 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      projects: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { callLogs: true } },
        },
      },
      apiKeys: {
        where: { status: { not: "REVOKED" } },
        select: { id: true },
      },
    },
  });

  if (!user) return errorResponse(404, "not_found", "User not found");

  // lastActive: most recent CallLog across all projects
  const lastLog = await prisma.callLog.findFirst({
    where: { projectId: { in: user.projects.map((p) => p.id) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  // keyCount per project
  const keyCountByProject = await prisma.apiKey.groupBy({
    by: ["userId"],
    where: { userId: user.id, status: { not: "REVOKED" } },
    _count: true,
  });
  const totalKeyCount = keyCountByProject[0]?._count ?? 0;

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    balance: Number(user.balance),
    suspended: user.suspended,
    deletedAt: user.deletedAt,
    lastActive: lastLog?.createdAt ?? null,
    createdAt: user.createdAt,
    keyCount: totalKeyCount,
    projects: user.projects.map((p) => ({
      id: p.id,
      name: p.name,
      callCount: p._count.callLogs,
      keyCount: totalKeyCount,
      createdAt: p.createdAt,
    })),
  });
}

/** DELETE /api/admin/users/:id — 软删除用户 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return errorResponse(404, "not_found", "User not found");
  if (user.deletedAt) return errorResponse(400, "already_deleted", "User is already deleted");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    }),
    prisma.apiKey.updateMany({
      where: { userId: params.id },
      data: { status: "REVOKED" },
    }),
  ]);

  return NextResponse.json({ success: true, message: "User account deleted" });
}
