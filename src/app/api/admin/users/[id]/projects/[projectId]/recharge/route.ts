import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

const prisma = new PrismaClient();

/** POST — Admin 手动充值（type=ADJUSTMENT） */
export async function POST(
  request: Request,
  { params }: { params: { id: string; projectId: string } },
) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { amount, description } = body;

  if (!amount || amount <= 0) {
    return errorResponse(422, "invalid_parameter", "amount must be positive", { param: "amount" });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.projectId, userId: params.id },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: params.projectId },
      data: { balance: { increment: amount } },
    });

    const txn = await tx.transaction.create({
      data: {
        projectId: params.projectId,
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
