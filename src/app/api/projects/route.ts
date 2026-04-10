export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

/** GET /api/projects — 当前用户的项目列表 */
export async function GET(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: auth.payload.userId },
    select: { balance: true },
  });

  const projects = await prisma.project.findMany({
    where: { userId: auth.payload.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
    },
  });

  // Return user-level balance on each project (all projects share the same balance)
  const userBalance = user ? Number(user.balance) : 0;
  return NextResponse.json({
    data: projects.map((p) => ({ ...p, balance: userBalance })),
  });
}

/** POST /api/projects — 创建项目 */
export async function POST(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  if (!body.name) {
    return errorResponse(400, "invalid_parameter", "name is required", { param: "name" });
  }

  const project = await prisma.project.create({
    data: {
      userId: auth.payload.userId,
      name: body.name,
      description: body.description ?? null,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: auth.payload.userId },
    select: { balance: true },
  });

  return NextResponse.json(
    {
      id: project.id,
      name: project.name,
      description: project.description,
      balance: user ? Number(user.balance) : 0,
      createdAt: project.createdAt,
    },
    { status: 201 },
  );
}
