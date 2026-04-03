export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { id: string } };

// POST /api/projects/:id/templates/fork — Fork 平台公共模板到项目
export async function POST(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const body = await request.json();
  const { templateId } = body;

  if (!templateId) {
    return errorResponse(400, "invalid_parameter", "templateId is required");
  }

  // 只能 fork 平台公共模板
  const source = await prisma.template.findUnique({
    where: { id: templateId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!source || source.projectId !== null) {
    return errorResponse(404, "not_found", "Public template not found");
  }

  if (source.versions.length === 0) {
    return errorResponse(400, "invalid_state", "Source template has no versions");
  }

  const activeVersion = source.activeVersionId
    ? await prisma.templateVersion.findUnique({ where: { id: source.activeVersionId } })
    : source.versions[0];

  if (!activeVersion) {
    return errorResponse(400, "invalid_state", "Source template active version not found");
  }

  // 创建 fork
  const forked = await prisma.template.create({
    data: {
      projectId: project.id,
      name: source.name,
      description: source.description,
      forkedFromId: source.id,
      createdBy: auth.payload.userId,
    },
  });

  const version = await prisma.templateVersion.create({
    data: {
      templateId: forked.id,
      versionNumber: 1,
      messages: activeVersion.messages as object,
      variables: activeVersion.variables as object,
      changelog: `Forked from "${source.name}" v${activeVersion.versionNumber}`,
    },
  });

  const result = await prisma.template.update({
    where: { id: forked.id },
    data: { activeVersionId: version.id },
    include: { versions: true },
  });

  return NextResponse.json(result, { status: 201 });
}
