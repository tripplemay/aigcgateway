export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { invalidateChannelsCache } from "../_cache";
import { ZodError } from "zod";
import {
  channelUpdateSchema,
  zodErrorResponse,
  validateChannelPriceForModality,
} from "@/lib/api/admin-schemas";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  // F-IG-01: strict zod whitelist — providerId/modelId/realModelId
  // (immutable FKs) are rejected. Unknown fields → 400.
  let data;
  try {
    data = channelUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err);
    throw err;
  }

  // BL-BILLING-AUDIT-EXT-P1 F-BAX-08: IMAGE channel 的 costPrice / sellPrice
  // 必须 {unit:'call', perCall>0}。其他 modality 走默认路径。
  if (data.costPrice !== undefined || data.sellPrice !== undefined) {
    const channel = await prisma.channel.findUnique({
      where: { id: params.id },
      select: { model: { select: { modality: true } } },
    });
    if (!channel) {
      return NextResponse.json(
        { error: "not_found", message: "Channel not found" },
        { status: 404 },
      );
    }
    const violation = validateChannelPriceForModality(
      channel.model.modality,
      data.costPrice,
      data.sellPrice,
    );
    if (violation) {
      return NextResponse.json(
        { error: "IMAGE_CHANNEL_REQUIRES_PERCALL_PRICE", message: violation },
        { status: 400 },
      );
    }
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
