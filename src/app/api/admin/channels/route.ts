export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const providerId = url.searchParams.get("providerId");
  const modelId = url.searchParams.get("modelId");
  const status = url.searchParams.get("status")?.toUpperCase();

  const channels = await prisma.channel.findMany({
    where: {
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {}),
      ...(status ? { status: status as "ACTIVE" | "DEGRADED" | "DISABLED" } : {}),
    },
    include: {
      provider: { select: { name: true, displayName: true } },
      model: { select: { name: true, displayName: true, modality: true } },
      healthChecks: { orderBy: { createdAt: "desc" }, take: 1, select: { result: true } },
    },
    orderBy: [{ model: { name: "asc" } }, { priority: "asc" }],
  });

  return NextResponse.json({
    data: channels.map((ch) => ({
      id: ch.id,
      providerName: ch.provider.displayName,
      providerId: ch.providerId,
      modelName: ch.model.name,
      modelDisplayName: ch.model.displayName,
      modelId: ch.modelId,
      modality: ch.model.modality,
      realModelId: ch.realModelId,
      priority: ch.priority,
      costPrice: ch.costPrice,
      sellPrice: ch.sellPrice,
      sellPriceLocked: ch.sellPriceLocked,
      status: ch.status,
      lastHealthResult: ch.healthChecks[0]?.result ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  if (!body.providerId || !body.modelId || !body.realModelId) {
    return errorResponse(400, "invalid_parameter", "providerId, modelId, realModelId required");
  }

  const channel = await prisma.channel.create({
    data: {
      providerId: body.providerId,
      modelId: body.modelId,
      realModelId: body.realModelId,
      priority: body.priority ?? 1,
      costPrice: body.costPrice ?? {},
      sellPrice: body.sellPrice ?? {},
      status: body.status ?? "ACTIVE",
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
