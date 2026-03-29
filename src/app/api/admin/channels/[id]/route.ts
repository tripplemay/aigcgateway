export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";


export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const channel = await prisma.channel.update({ where: { id: params.id }, data: body });
  return NextResponse.json(channel);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  await prisma.channel.delete({ where: { id: params.id } });
  return NextResponse.json({ message: "Channel deleted" });
}
