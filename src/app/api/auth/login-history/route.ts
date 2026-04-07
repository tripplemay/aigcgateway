export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

export async function GET(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const records = await prisma.loginHistory.findMany({
    where: { userId: auth.payload.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      ip: true,
      userAgent: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: records });
}
