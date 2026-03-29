import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

const prisma = new PrismaClient();

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const config = await prisma.providerConfig.findUnique({
    where: { providerId: params.id },
  });

  return NextResponse.json({ data: config });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();

  const config = await prisma.providerConfig.upsert({
    where: { providerId: params.id },
    update: body,
    create: { providerId: params.id, ...body },
  });

  return NextResponse.json({ data: config });
}
