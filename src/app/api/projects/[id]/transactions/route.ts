export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";


/** GET /api/projects/:id/transactions — 交易记录（分页） */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  const type = url.searchParams.get("type")?.toUpperCase();

  const where = {
    projectId: params.id,
    ...(type ? { type: type as "RECHARGE" | "DEDUCTION" | "REFUND" | "ADJUSTMENT" } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        status: true,
        paymentMethod: true,
        description: true,
        createdAt: true,
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return NextResponse.json({
    data: data.map((t) => ({
      ...t,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
