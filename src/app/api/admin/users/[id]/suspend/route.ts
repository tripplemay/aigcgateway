export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/** POST /api/admin/users/:id/suspend — 暂停/恢复用户 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { suspended } = body;

  if (typeof suspended !== "boolean") {
    return errorResponse(400, "invalid_parameter", "suspended must be a boolean");
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return errorResponse(404, "not_found", "User not found");
  if (user.deletedAt) return errorResponse(400, "user_deleted", "Cannot suspend a deleted user");

  let keysAffected = 0;

  if (suspended) {
    // Suspend: mark user + suspend all active keys
    const result = await prisma.$transaction([
      prisma.user.update({
        where: { id: params.id },
        data: { suspended: true },
      }),
      prisma.apiKey.updateMany({
        where: { userId: params.id, status: "ACTIVE" },
        data: { status: "REVOKED" },
      }),
    ]);
    keysAffected = result[1].count;
  } else {
    // Unsuspend: just clear the flag (keys stay revoked, user creates new ones)
    await prisma.user.update({
      where: { id: params.id },
      data: { suspended: false },
    });
  }

  return NextResponse.json({ success: true, suspended, keysAffected });
}
