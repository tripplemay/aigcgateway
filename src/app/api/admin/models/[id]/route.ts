export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/**
 * PATCH /api/admin/models/:id
 *
 * 支持字段：
 *   enabled: boolean      — 启用/禁用模型
 *   sellPrice: object      — 编辑售价（更新该模型所有 ACTIVE channel 的 sellPrice）
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();

  // Whitelist allowed fields
  const modelUpdate: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") {
    modelUpdate.enabled = body.enabled;
  }

  // Update model if there are model-level changes
  if (Object.keys(modelUpdate).length > 0) {
    await prisma.model.update({
      where: { id: params.id },
      data: modelUpdate,
    });
  }

  // Update sellPrice on all channels of this model if provided
  if (body.sellPrice !== undefined) {
    if (typeof body.sellPrice !== "object" || body.sellPrice === null) {
      return errorResponse(400, "invalid_parameter", "sellPrice must be a valid object");
    }
    await prisma.channel.updateMany({
      where: { modelId: params.id, sellPriceLocked: false },
      data: { sellPrice: body.sellPrice },
    });
  }

  // Return updated model with channels
  const model = await prisma.model.findUnique({
    where: { id: params.id },
    include: {
      channels: {
        include: {
          provider: { select: { name: true, displayName: true } },
        },
        orderBy: { priority: "asc" },
      },
    },
  });

  if (!model) {
    return errorResponse(404, "not_found", "Model not found");
  }

  return NextResponse.json(model);
}
