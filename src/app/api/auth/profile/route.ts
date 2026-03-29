export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

export async function GET(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: auth.payload.userId },
    select: { id: true, email: true, name: true, role: true, emailVerified: true },
  });
  if (!user) return errorResponse(404, "not_found", "User not found");
  return NextResponse.json(user);
}

export async function PATCH(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { name } = body;

  const user = await prisma.user.update({
    where: { id: auth.payload.userId },
    data: { ...(name !== undefined ? { name } : {}) },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json(user);
}
