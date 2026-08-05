/**
 * BL-SEC-HOTFIX-2608 F-SH-02 — E2E 测试账号充值助手。
 *
 * 此前 e2e-test.ts / e2e-errors.ts 通过「创建充值订单 → 伪造支付宝回调」给测试
 * 账号充值。那条路径正是审查 C1 的攻击链本身（webhook 无验签 + recharge 回传
 * paymentOrderId），现已被 PAYMENT_ENABLED 开关关闭，脚本不能再依赖它。
 *
 * 本助手直接走 DB，语义对齐 admin 手动充值 (/api/admin/users/[id]/recharge)：
 * 增加 User.balance 并写一条 ADJUSTMENT Transaction，两步在同一事务内完成，
 * 使依赖交易流水的断言仍能拿到记录。
 */

import { prisma } from "@/lib/prisma";

export interface FundUserResult {
  balance: number;
  transactionId: string;
}

/**
 * 给指定用户充值。
 *
 * @param userId 目标用户
 * @param amount 充值金额（USD，须为正）
 * @param description 流水描述，默认标注来源为 E2E
 */
export async function fundUser(
  userId: string,
  amount: number,
  description = "E2E test funding",
): Promise<FundUserResult> {
  if (!(amount > 0)) {
    throw new Error(`fundUser: amount must be positive, got ${amount}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, defaultProjectId: true },
  });
  if (!user) throw new Error(`fundUser: user ${userId} not found`);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });
    const txn = await tx.transaction.create({
      data: {
        projectId: user.defaultProjectId ?? undefined,
        userId,
        type: "ADJUSTMENT",
        amount,
        balanceAfter: updated.balance,
        status: "COMPLETED",
        description,
      },
    });
    return { balance: Number(updated.balance), transactionId: txn.id };
  });
}

/** 便捷重载：已知 email 时先解析出 userId 再充值。 */
export async function fundUserByEmail(
  email: string,
  amount: number,
  description?: string,
): Promise<FundUserResult> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`fundUser: user with email ${email} not found`);
  return fundUser(user.id, amount, description);
}
