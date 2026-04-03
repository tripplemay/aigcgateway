export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: Promise<{ templateId: string }> };

// GET /api/admin/templates/:templateId — 获取模板详情
export async function GET(request: Request, { params }: Params) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { templateId } = await params;

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  if (!template || template.projectId !== null) {
    return errorResponse(404, "not_found", "Template not found");
  }

  return NextResponse.json(template);
}

// PATCH /api/admin/templates/:templateId — 更新模板基本信息
export async function PATCH(request: Request, { params }: Params) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { templateId } = await params;
  const body = await request.json();

  const existing = await prisma.template.findUnique({ where: { id: templateId } });
  if (!existing || existing.projectId !== null) {
    return errorResponse(404, "not_found", "Template not found");
  }

  const { name, description, category } = body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (category !== undefined) data.category = category;

  const updated = await prisma.template.update({
    where: { id: templateId },
    data,
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  return NextResponse.json(updated);
}

// DELETE /api/admin/templates/:templateId — 删除模板
export async function DELETE(request: Request, { params }: Params) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { templateId } = await params;

  const existing = await prisma.template.findUnique({ where: { id: templateId } });
  if (!existing || existing.projectId !== null) {
    return errorResponse(404, "not_found", "Template not found");
  }

  // 先删除所有版本，再删除模板
  await prisma.templateVersion.deleteMany({ where: { templateId } });
  await prisma.template.delete({ where: { id: templateId } });

  return NextResponse.json({ success: true });
}
