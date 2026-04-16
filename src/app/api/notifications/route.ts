export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";

/** GET /api/notifications?unread_only=true&limit=20 */
export async function GET(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread_only") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);

  const where = {
    userId: auth.payload.userId,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventType: true,
        channel: true,
        status: true,
        payload: true,
        error: true,
        readAt: true,
        sentAt: true,
        createdAt: true,
        projectId: true,
      },
    }),
    prisma.notification.count({
      where: { userId: auth.payload.userId, readAt: null },
    }),
  ]);

  return NextResponse.json({ data: notifications, unreadCount });
}
