export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

/** GET /api/projects/:id — 项目详情 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
    include: {
      user: { select: { balance: true } },
      _count: { select: { callLogs: true } },
    },
  });

  if (!project) {
    return errorResponse(404, "not_found", "Project not found");
  }

  const keyCount = await prisma.apiKey.count({
    where: { userId: auth.payload.userId, status: { not: "REVOKED" } },
  });

  return NextResponse.json({
    id: project.id,
    name: project.name,
    description: project.description,
    balance: Number(project.user.balance),
    alertThreshold: project.alertThreshold ? Number(project.alertThreshold) : null,
    rateLimit: project.rateLimit,
    createdAt: project.createdAt,
    stats: {
      keyCount,
      callCount: project._count.callLogs,
    },
  });
}

/** DELETE /api/projects/:id — 删除项目 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const existing = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });

  if (!existing) {
    return errorResponse(404, "not_found", "Project not found");
  }

  // Collect child IDs for deep cleanup
  const actionIds = (
    await prisma.action.findMany({ where: { projectId: params.id }, select: { id: true } })
  ).map((a) => a.id);
  const templateIds = (
    await prisma.template.findMany({ where: { projectId: params.id }, select: { id: true } })
  ).map((t) => t.id);

  // Delete related records (deepest first), then the project
  await prisma.$transaction([
    prisma.templateStep.deleteMany({
      where: { OR: [{ templateId: { in: templateIds } }, { actionId: { in: actionIds } }] },
    }),
    prisma.actionVersion.deleteMany({ where: { actionId: { in: actionIds } } }),
    prisma.callLog.deleteMany({ where: { projectId: params.id } }),
    prisma.transaction.deleteMany({ where: { projectId: params.id } }),
    prisma.action.deleteMany({ where: { projectId: params.id } }),
    prisma.template.deleteMany({ where: { projectId: params.id } }),
    prisma.project.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ success: true });
}

/** PATCH /api/projects/:id — 更新项目 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const existing = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });

  if (!existing) {
    return errorResponse(404, "not_found", "Project not found");
  }

  let body: {
    name?: string;
    description?: string;
    alertThreshold?: number;
    rateLimit?: Record<string, number> | null;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  const project = await prisma.project.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.alertThreshold !== undefined ? { alertThreshold: body.alertThreshold } : {}),
      ...(body.rateLimit !== undefined ? { rateLimit: body.rateLimit ?? undefined } : {}),
    },
    include: { user: { select: { balance: true } } },
  });

  return NextResponse.json({
    id: project.id,
    name: project.name,
    description: project.description,
    balance: Number(project.user.balance),
    alertThreshold: project.alertThreshold ? Number(project.alertThreshold) : null,
  });
}
