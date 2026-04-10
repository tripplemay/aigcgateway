export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/** GET /api/admin/users/:id/transactions — 用户交易记录（分页） */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!user) return errorResponse(404, "not_found", "User not found");

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get("pageSize") ?? "10", 10)));

  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: params.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        description: true,
        createdAt: true,
      },
    }),
    prisma.transaction.count({ where: { userId: params.id } }),
  ]);

  return NextResponse.json({
    data: data.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
      description: t.description,
      createdAt: t.createdAt,
    })),
    pagination: { page, pageSize, total },
  });
}
