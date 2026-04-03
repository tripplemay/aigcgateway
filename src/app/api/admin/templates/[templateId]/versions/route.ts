export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: Promise<{ templateId: string }> };

// POST /api/admin/templates/:templateId/versions — 创建新版本
export async function POST(request: Request, { params }: Params) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { templateId } = await params;
  const body = await request.json();
  const { messages, variables, changelog } = body;

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template || template.projectId !== null) {
    return errorResponse(404, "not_found", "Template not found");
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return errorResponse(400, "invalid_parameter", "messages array is required");
  }
  if (!variables || !Array.isArray(variables)) {
    return errorResponse(400, "invalid_parameter", "variables array is required");
  }

  // 获取当前最大版本号
  const latest = await prisma.templateVersion.findFirst({
    where: { templateId },
    orderBy: { versionNumber: "desc" },
  });

  const version = await prisma.templateVersion.create({
    data: {
      templateId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      messages,
      variables,
      changelog: changelog || null,
    },
  });

  return NextResponse.json(version, { status: 201 });
}
