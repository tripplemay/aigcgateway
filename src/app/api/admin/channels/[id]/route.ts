export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { invalidateChannelsCache } from "../_cache";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  // Auto-lock sellPrice when manually modified
  if (body.sellPrice !== undefined) {
    body.sellPriceLocked = true;
  }
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
