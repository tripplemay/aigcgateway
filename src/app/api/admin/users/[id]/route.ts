export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      projects: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { callLogs: true } },
        },
      },
    },
  });

  if (!user) return errorResponse(404, "not_found", "User not found");

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    balance: Number(user.balance),
    createdAt: user.createdAt,
    projects: user.projects.map((p) => ({
      id: p.id,
      name: p.name,
      callCount: p._count.callLogs,
      createdAt: p.createdAt,
    })),
  });
}
