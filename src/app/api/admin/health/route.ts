/**
 * GET /api/admin/health
 *
 * 返回所有通道健康状态概览
 */

import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET() {
  const channels = await prisma.channel.findMany({
    include: {
      provider: { select: { name: true, displayName: true } },
      model: { select: { name: true, displayName: true, modality: true } },
      healthChecks: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          level: true,
          result: true,
          latencyMs: true,
          errorMessage: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ provider: { name: "asc" } }, { model: { name: "asc" } }],
  });

  const summary = {
    active: channels.filter((c) => c.status === "ACTIVE").length,
    degraded: channels.filter((c) => c.status === "DEGRADED").length,
    disabled: channels.filter((c) => c.status === "DISABLED").length,
    total: channels.length,
  };

  const data = channels.map((ch) => ({
    channelId: ch.id,
    provider: ch.provider.displayName,
    providerName: ch.provider.name,
    model: ch.model.name,
    modelDisplayName: ch.model.displayName,
    modality: ch.model.modality,
    realModelId: ch.realModelId,
    status: ch.status,
    priority: ch.priority,
    lastChecks: ch.healthChecks,
  }));

  return NextResponse.json({ summary, data });
}
