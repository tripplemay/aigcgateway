export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { invalidateChannelsCache } from "../_cache";
import { ZodError } from "zod";
import { channelUpdateSchema, zodErrorResponse } from "@/lib/api/admin-schemas";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  // F-IG-01: strict zod whitelist — providerId/modelId/realModelId/sellPrice
  // (immutable or alias-managed) are rejected. Unknown fields → 400.
  let data;
  try {
    data = channelUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err);
    throw err;
  }

  const channel = await prisma.channel.update({ where: { id: params.id }, data });
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
