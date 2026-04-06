export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

type Params = { params: { templateId: string } };

// PATCH /api/admin/templates/:templateId — Admin update template (isPublic, qualityScore)
export async function PATCH(request: Request, { params }: Params) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (typeof body.isPublic === "boolean") update.isPublic = body.isPublic;
  if (typeof body.qualityScore === "number") update.qualityScore = body.qualityScore;

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
