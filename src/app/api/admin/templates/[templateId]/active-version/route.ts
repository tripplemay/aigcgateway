export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: Promise<{ templateId: string }> };

// PATCH /api/admin/templates/:templateId/active-version — 切换活跃版本
export async function PATCH(request: Request, { params }: Params) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { templateId } = await params;
  const body = await request.json();
  const { versionId } = body;

  if (!versionId) {
    return errorResponse(400, "invalid_parameter", "versionId is required");
  }

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template || template.projectId !== null) {
    return errorResponse(404, "not_found", "Template not found");
  }

  // 验证版本属于该模板
  const version = await prisma.templateVersion.findUnique({ where: { id: versionId } });
  if (!version || version.templateId !== templateId) {
    return errorResponse(404, "not_found", "Version not found for this template");
  }

  const updated = await prisma.template.update({
    where: { id: templateId },
    data: { activeVersionId: versionId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  return NextResponse.json(updated);
}
