export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/**
 * DELETE /api/admin/model-aliases/:id/link/:modelId
 * 移除模型与别名的关联
 * 若模型不再挂载到任何别名，自动设 Model.enabled=false
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { id, modelId } = await params;

  const link = await prisma.aliasModelLink.findUnique({
    where: { aliasId_modelId: { aliasId: id, modelId } },
  });
  if (!link) {
    return errorResponse(404, "not_found", "Link not found");
  }

  await prisma.aliasModelLink.delete({
    where: { id: link.id },
  });

  // Check if model still belongs to any alias
  const remainingLinks = await prisma.aliasModelLink.count({
    where: { modelId },
  });
  if (remainingLinks === 0) {
    await prisma.model.update({
      where: { id: modelId },
      data: { enabled: false },
    });
  }

  return NextResponse.json({ success: true });
}
