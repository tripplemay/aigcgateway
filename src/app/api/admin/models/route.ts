export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const models = await prisma.model.findMany({
    include: {
      _count: { select: { channels: true } },
      channels: { where: { status: "ACTIVE" }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    data: models.map((m) => ({
      ...m,
      channelCount: m._count.channels,
      activeChannelCount: m.channels.length,
      channels: undefined,
    })),
  });
}

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  if (!body.name || !body.displayName || !body.modality) {
    return errorResponse(400, "invalid_parameter", "name, displayName, modality required");
  }

  const model = await prisma.model.create({ data: body });
  return NextResponse.json(model, { status: 201 });
}
