export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { invalidateChannelsCache } from "../_cache";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  // sellPrice is read-only on channels — pricing managed via alias.sellPrice
  delete body.sellPrice;
  const channel = await prisma.channel.update({ where: { id: params.id }, data: body });
  await invalidateChannelsCache();
  return NextResponse.json(channel);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  await prisma.channel.delete({ where: { id: params.id } });
  await invalidateChannelsCache();
  return NextResponse.json({ message: "Channel deleted" });
}
