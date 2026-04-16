export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";

/** PATCH /api/notifications/mark-all-read */
export async function PATCH(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const now = new Date();
  const result = await prisma.notification.updateMany({
    where: { userId: auth.payload.userId, readAt: null },
    data: { readAt: now },
  });

  return NextResponse.json({ success: true, updated: result.count });
}
