import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

const prisma = new PrismaClient();

/** GET /api/projects/:id — 项目详情 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });

  if (!project) {
    return errorResponse(404, "not_found", "Project not found");
  }

  return NextResponse.json({
    id: project.id,
    name: project.name,
    description: project.description,
    balance: Number(project.balance),
    alertThreshold: project.alertThreshold ? Number(project.alertThreshold) : null,
    rateLimit: project.rateLimit,
    createdAt: project.createdAt,
  });
}

/** PATCH /api/projects/:id — 更新项目 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const existing = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });

  if (!existing) {
    return errorResponse(404, "not_found", "Project not found");
  }

  let body: { name?: string; description?: string; alertThreshold?: number };
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
    },
  });

  return NextResponse.json({
    id: project.id,
    name: project.name,
    description: project.description,
    balance: Number(project.balance),
    alertThreshold: project.alertThreshold ? Number(project.alertThreshold) : null,
  });
}
