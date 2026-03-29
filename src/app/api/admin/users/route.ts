import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const users = await prisma.user.findMany({
    where: { role: "DEVELOPER" },
    include: {
      projects: {
        select: { id: true, balance: true, _count: { select: { callLogs: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      projectCount: u.projects.length,
      totalBalance: u.projects.reduce((sum, p) => sum + Number(p.balance), 0),
      totalCalls: u.projects.reduce((sum, p) => sum + p._count.callLogs, 0),
      createdAt: u.createdAt,
    })),
  });
}
