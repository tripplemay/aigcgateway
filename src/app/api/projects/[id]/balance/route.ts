export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";


/** GET /api/projects/:id/balance — 余额信息 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
    select: {
      id: true,
      balance: true,
      alertThreshold: true,
    },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  // 最近一次充值
  const lastRecharge = await prisma.transaction.findFirst({
    where: { projectId: params.id, type: "RECHARGE", status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { amount: true, createdAt: true },
  });

  return NextResponse.json({
    balance: Number(project.balance),
    alertThreshold: project.alertThreshold ? Number(project.alertThreshold) : null,
    lastRecharge: lastRecharge
      ? {
          amount: Number(lastRecharge.amount),
          createdAt: lastRecharge.createdAt,
        }
      : null,
  });
}
