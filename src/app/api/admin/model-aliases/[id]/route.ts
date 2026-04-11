export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import { checkChannel } from "@/lib/health/scheduler";

/**
 * PATCH /api/admin/model-aliases/:id
 * 编辑别名元数据（alias/brand/enabled/description/modality/contextWindow/maxTokens/capabilities）
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.modelAlias.findUnique({ where: { id } });
  if (!existing) {
    return errorResponse(404, "not_found", "Alias not found");
  }

  const allowedFields = [
    "alias",
    "brand",
    "modality",
    "enabled",
    "contextWindow",
    "maxTokens",
    "capabilities",
    "description",
    "sellPrice",
    "openRouterModelId",
  ] as const;

  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  }

  if (Object.keys(data).length === 0) {
    return errorResponse(400, "invalid_parameter", "No valid fields to update");
  }

  // If alias is being changed, check uniqueness
  if (data.alias && data.alias !== existing.alias) {
    const conflict = await prisma.modelAlias.findUnique({
      where: { alias: data.alias as string },
    });
    if (conflict) {
      return errorResponse(409, "conflict", `Alias "${data.alias}" already exists`);
    }
  }

  const updated = await prisma.modelAlias.update({ where: { id }, data });

  // Instant health check when alias is being enabled
  if (data.enabled === true && !existing.enabled) {
    const links = await prisma.aliasModelLink.findMany({
      where: { aliasId: id },
      select: { model: { select: { channels: { select: { id: true } } } } },
    });
    for (const link of links) {
      for (const ch of link.model.channels) {
        checkChannel(ch.id).catch((err) => {
          console.error(`[health] instant check failed for channel ${ch.id}:`, err);
        });
      }
    }
  }

  return NextResponse.json(updated);
}

/**
 * DELETE /api/admin/model-aliases/:id
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { id } = await params;

  const alias = await prisma.modelAlias.findUnique({
    where: { id },
    include: { models: { select: { modelId: true } } },
  });
  if (!alias) {
    return errorResponse(404, "not_found", "Alias not found");
  }

  const linkedModelIds = alias.models.map((l) => l.modelId);

  await prisma.modelAlias.delete({ where: { id } });

  // Auto-disable models that no longer belong to any alias
  await autoDisableOrphanedModels(linkedModelIds);

  return NextResponse.json({ success: true });
}

/**
 * Disable models that are not linked to any alias.
 */
async function autoDisableOrphanedModels(modelIds: string[]): Promise<void> {
  if (modelIds.length === 0) return;

  for (const modelId of modelIds) {
    const linkCount = await prisma.aliasModelLink.count({
      where: { modelId },
    });
    if (linkCount === 0) {
      await prisma.model.update({
        where: { id: modelId },
        data: { enabled: false },
      });
    }
  }
}
