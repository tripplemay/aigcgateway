export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/**
 * DELETE /api/admin/model-aliases/:id
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { id } = await params;

  const alias = await prisma.modelAlias.findUnique({ where: { id } });
  if (!alias) {
    return errorResponse(404, "not_found", "Alias not found");
  }

  await prisma.modelAlias.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
