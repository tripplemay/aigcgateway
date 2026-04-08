export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/**
 * POST /api/admin/model-aliases/merge
 * 归入已有模型：sourceModel → targetModel
 * 1. 创建 alias 记录（sourceModel.name → targetModelName）
 * 2. 迁移 sourceModel 的 Channel 到 targetModel
 * 3. 删除 sourceModel
 */
export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { sourceModelId, targetModelName } = body;

  if (!sourceModelId || !targetModelName) {
    return errorResponse(400, "invalid_parameter", "sourceModelId and targetModelName required");
  }

  const sourceModel = await prisma.model.findUnique({
    where: { id: sourceModelId },
    include: { channels: true },
  });
  if (!sourceModel) {
    return errorResponse(404, "not_found", "Source model not found");
  }

  const targetModel = await prisma.model.findUnique({
    where: { name: targetModelName },
  });
  if (!targetModel) {
    return errorResponse(404, "not_found", `Target model "${targetModelName}" not found`);
  }

  if (sourceModel.id === targetModel.id) {
    return errorResponse(400, "invalid_parameter", "Cannot merge a model into itself");
  }

  // Transaction: create alias + migrate channels + delete source
  await prisma.$transaction(async (tx) => {
    // 1. Create alias (sourceModel.name → targetModelName)
    await tx.modelAlias.create({
      data: { alias: sourceModel.name, modelName: targetModelName },
    });

    // 2. Migrate channels from source to target
    await tx.channel.updateMany({
      where: { modelId: sourceModelId },
      data: { modelId: targetModel.id },
    });

    // 3. Delete source model
    await tx.model.delete({ where: { id: sourceModelId } });
  });

  return NextResponse.json({
    success: true,
    merged: {
      source: sourceModel.name,
      target: targetModelName,
      channelsMigrated: sourceModel.channels.length,
    },
  });
}
