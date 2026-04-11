export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import { checkChannel } from "@/lib/health/scheduler";

/**
 * POST /api/admin/model-aliases/:id/link
 * 挂载模型到别名 { modelId }
 * 自动设 Model.enabled=true
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const { modelId } = body;

  if (!modelId) {
    return errorResponse(400, "invalid_parameter", "modelId is required");
  }

  const alias = await prisma.modelAlias.findUnique({ where: { id } });
  if (!alias) {
    return errorResponse(404, "not_found", "Alias not found");
  }

  const model = await prisma.model.findUnique({ where: { id: modelId } });
  if (!model) {
    return errorResponse(404, "not_found", "Model not found");
  }

  // Check if already linked
  const existing = await prisma.aliasModelLink.findUnique({
    where: { aliasId_modelId: { aliasId: id, modelId } },
  });
  if (existing) {
    return errorResponse(409, "conflict", "Model is already linked to this alias");
  }

  // Create link + auto-enable model
  await prisma.$transaction([
    prisma.aliasModelLink.create({
      data: { aliasId: id, modelId },
    }),
    prisma.model.update({
      where: { id: modelId },
      data: { enabled: true },
    }),
  ]);

  // Instant health check trigger if alias is enabled
  if (alias.enabled) {
    const channels = await prisma.channel.findMany({
      where: { modelId },
      select: { id: true },
    });
    for (const ch of channels) {
      checkChannel(ch.id).catch((err) => {
        console.error(`[health] instant check failed for channel ${ch.id}:`, err);
      });
    }
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
