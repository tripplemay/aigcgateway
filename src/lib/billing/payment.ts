/**
 * 支付入账逻辑（支付宝 / 微信共用）
 *
 * 事务内：更新订单 COMPLETED → 增余额 → 写 Transaction
 * 幂等：非 PENDING 状态直接返回成功
 */

import { prisma } from "@/lib/prisma";


export interface ProcessPaymentResult {
  success: boolean;
  alreadyProcessed: boolean;
  message: string;
}

export async function processPaymentCallback(
  paymentOrderId: string,
  paymentRaw: unknown,
): Promise<ProcessPaymentResult> {
  // 查找订单
  const order = await prisma.rechargeOrder.findUnique({
    where: { paymentOrderId },
  });

  if (!order) {
    return { success: false, alreadyProcessed: false, message: "Order not found" };
  }

  // 幂等：非 PENDING 状态直接返回成功
  if (order.status !== "PENDING") {
    return {
      success: true,
      alreadyProcessed: true,
      message: `Order already ${order.status}`,
    };
  }

  // 事务：更新订单 + 增余额 + 写 Transaction
  await prisma.$transaction(async (tx) => {
    // 1. 更新订单状态
    await tx.rechargeOrder.update({
      where: { id: order.id },
      data: {
        status: "COMPLETED",
        paidAt: new Date(),
        paymentRaw: paymentRaw as object,
      },
    });

    // 2. 增加项目余额
    await tx.project.update({
      where: { id: order.projectId },
      data: {
        balance: { increment: order.amount },
      },
    });

    // 3. 获取更新后的余额
    const project = await tx.project.findUnique({
      where: { id: order.projectId },
      select: { balance: true },
    });

    // 4. 写入 Transaction
    const txnId = await tx.transaction.create({
      data: {
        projectId: order.projectId,
        type: "RECHARGE",
        amount: order.amount,
        balanceAfter: project!.balance,
        status: "COMPLETED",
        paymentMethod: order.paymentMethod,
        paymentOrderId: order.paymentOrderId,
        paymentRaw: paymentRaw as object,
        description: `Recharge $${Number(order.amount).toFixed(2)} via ${order.paymentMethod}`,
      },
    });

    // 5. 关联 transactionId
    await tx.rechargeOrder.update({
      where: { id: order.id },
      data: { transactionId: txnId.id },
    });
  });

  return { success: true, alreadyProcessed: false, message: "Payment processed" };
}

/**
 * 标记订单失败
 */
export async function markOrderFailed(
  paymentOrderId: string,
  paymentRaw: unknown,
): Promise<void> {
  await prisma.rechargeOrder.updateMany({
    where: { paymentOrderId, status: "PENDING" },
    data: {
      status: "FAILED",
      paymentRaw: paymentRaw as object,
    },
  });
}
