export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

/** POST /api/projects/:id/recharge — 创建充值订单 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  let body: { amount?: number; paymentMethod?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  const { amount, paymentMethod } = body;

  if (!amount || amount < 1 || amount > 10000) {
    return errorResponse(422, "invalid_parameter", "Amount must be between $1 and $10,000", {
      param: "amount",
    });
  }

  if (!paymentMethod || !["alipay", "wechat"].includes(paymentMethod)) {
    return errorResponse(422, "invalid_parameter", "paymentMethod must be alipay or wechat", {
      param: "paymentMethod",
    });
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  const order = await prisma.rechargeOrder.create({
    data: {
      userId: auth.payload.userId,
      amount,
      paymentMethod,
      expiresAt,
      status: "PENDING",
    },
  });

  // P1: 返回订单信息，实际支付链接需要对接支付渠道 SDK 生成
  // 生产环境需替换为真实支付链接
  const paymentUrl =
    paymentMethod === "alipay"
      ? `https://openapi.alipay.com/gateway.do?out_trade_no=${order.id}&total_amount=${amount}`
      : `weixin://wxpay/bizpayurl?out_trade_no=${order.id}&total_fee=${Math.round(amount * 100)}`;

  await prisma.rechargeOrder.update({
    where: { id: order.id },
    data: { paymentUrl, paymentOrderId: order.id },
  });

  return NextResponse.json(
    {
      orderId: order.id,
      amount: Number(order.amount),
      paymentMethod: order.paymentMethod,
      paymentUrl,
      status: "pending",
      expiresAt: order.expiresAt.toISOString(),
    },
    { status: 201 },
  );
}
