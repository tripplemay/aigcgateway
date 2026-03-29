import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

const prisma = new PrismaClient();

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const model = await prisma.model.update({ where: { id: params.id }, data: body });
  return NextResponse.json(model);
}
