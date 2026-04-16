export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

/** PATCH /api/notifications/[id] — mark single notification as read */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const notification = await prisma.notification.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, readAt: true },
  });

  if (!notification || notification.userId !== auth.payload.userId) {
    return errorResponse(404, "not_found", "Notification not found");
  }

  if (notification.readAt) {
    return NextResponse.json({ success: true }); // already read — idempotent
  }

  const updated = await prisma.notification.update({
    where: { id: params.id },
    data: { readAt: new Date() },
    select: { id: true, readAt: true },
  });

  return NextResponse.json({ success: true, data: updated });
}
