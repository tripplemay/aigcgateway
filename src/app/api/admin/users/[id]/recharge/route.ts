export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

/** POST /api/admin/users/:id/recharge — Admin 手动充值到 User.balance */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { amount, description } = body;

  if (!amount || amount <= 0) {
    return errorResponse(422, "invalid_parameter", "amount must be positive", { param: "amount" });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return errorResponse(404, "not_found", "User not found");

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: params.id },
      data: { balance: { increment: amount } },
    });

    const txn = await tx.transaction.create({
      data: {
        projectId: user.defaultProjectId ?? "",
        userId: params.id,
        type: "ADJUSTMENT",
        amount,
        balanceAfter: updated.balance,
        status: "COMPLETED",
        description: description ?? `Admin manual recharge by ${auth.payload.userId}`,
      },
    });

    return { balance: Number(updated.balance), transactionId: txn.id };
  });

  return NextResponse.json(result, { status: 201 });
}
