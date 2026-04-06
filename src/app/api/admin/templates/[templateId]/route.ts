export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

type Params = { params: { templateId: string } };

// DELETE /api/admin/templates/:templateId — Admin delete template
export async function DELETE(request: Request, { params }: Params) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  await prisma.template.delete({ where: { id: params.templateId } });
  return NextResponse.json({ deleted: true });
}
