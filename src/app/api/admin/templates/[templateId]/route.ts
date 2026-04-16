export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { getTemplateCategories, validateCategoryId } from "@/lib/template-categories";

type Params = { params: { templateId: string } };

// GET /api/admin/templates/:templateId — Admin template detail (no project restriction)
export async function GET(request: Request, { params }: Params) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const template = await prisma.template.findUnique({
    where: { id: params.templateId },
    include: {
      project: { select: { id: true, name: true } },
      steps: {
        orderBy: { order: "asc" },
        include: {
          action: {
            select: {
              id: true,
              name: true,
              model: true,
              description: true,
              activeVersionId: true,
              versions: {
                orderBy: { versionNumber: "desc" },
                take: 1,
                select: {
                  versionNumber: true,
                  messages: true,
                  variables: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json(template);
}

// PATCH /api/admin/templates/:templateId — Admin update template
// Accepts isPublic, qualityScore, category. When publishing (isPublic=true)
// without an explicit category, falls back to 'other'.
export async function PATCH(request: Request, { params }: Params) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const update: Record<string, unknown> = {};

  if (typeof body.isPublic === "boolean") update.isPublic = body.isPublic;
  if (typeof body.qualityScore === "number") update.qualityScore = body.qualityScore;

  const wantsCategory = typeof body.category === "string" || body.category === null;
  const goingPublic = body.isPublic === true;

  if (wantsCategory || goingPublic) {
    const cats = await getTemplateCategories();
    if (body.category === null) {
      update.category = null;
    } else if (typeof body.category === "string") {
      update.category = validateCategoryId(cats, body.category);
    } else if (goingPublic) {
      const current = await prisma.template.findUnique({
        where: { id: params.templateId },
        select: { category: true },
      });
      if (!current?.category) {
        update.category = "other";
      }
    }
  }

  const template = await prisma.template.update({
    where: { id: params.templateId },
    data: update,
  });
  return NextResponse.json(template);
}

// DELETE /api/admin/templates/:templateId — Admin delete template
export async function DELETE(request: Request, { params }: Params) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  await prisma.template.delete({ where: { id: params.templateId } });
  return NextResponse.json({ deleted: true });
}
