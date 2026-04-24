export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

export async function GET(request: Request, { params }: { params: { traceId: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const log = await prisma.callLog.findUnique({
    where: { traceId: params.traceId },
    include: {
      project: { select: { name: true } },
      channel: { select: { id: true, realModelId: true, provider: { select: { name: true } } } },
    },
  });

  if (!log) return errorResponse(404, "not_found", "Log not found");

  return NextResponse.json({
    ...log,
    costPrice: log.costPrice ? Number(log.costPrice) : null,
    sellPrice: log.sellPrice ? Number(log.sellPrice) : null,
    projectName: log.project?.name ?? null,
    channelId: log.channel?.id ?? log.channelId,
    channelProvider: log.channel?.provider.name ?? null,
    channelRealModelId: log.channel?.realModelId ?? null,
  });
}
