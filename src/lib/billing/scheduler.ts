/**
 * 计费定时任务
 *
 * - 每 5 分钟：关闭超 30 分钟未支付的 PENDING 订单（→ EXPIRED）
 * - 每小时：检查所有项目余额，低于 alertThreshold 推送告警
 */

import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

let expiredOrderTimer: ReturnType<typeof setInterval> | null = null;
let balanceAlertTimer: ReturnType<typeof setInterval> | null = null;

export function startBillingScheduler(): void {
  // 每 5 分钟关闭过期订单
  expiredOrderTimer = setInterval(
    () => {
      closeExpiredOrders().catch((err) => {
        console.error("[billing-scheduler] close expired orders error:", err);
      });
    },
    5 * 60 * 1000,
  );

  // 每小时检查余额告警
  balanceAlertTimer = setInterval(
    () => {
      checkBalanceAlerts().catch((err) => {
        console.error("[billing-scheduler] balance alert error:", err);
      });
    },
    60 * 60 * 1000,
  );

  console.log("[billing-scheduler] started");
}

export function stopBillingScheduler(): void {
  if (expiredOrderTimer) {
    clearInterval(expiredOrderTimer);
    expiredOrderTimer = null;
  }
  if (balanceAlertTimer) {
    clearInterval(balanceAlertTimer);
    balanceAlertTimer = null;
  }
  console.log("[billing-scheduler] stopped");
}

/**
 * 关闭超过 30 分钟未支付的 PENDING 订单
 */
export async function closeExpiredOrders(): Promise<number> {
  const result = await prisma.rechargeOrder.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });

  if (result.count > 0) {
    console.log(`[billing-scheduler] closed ${result.count} expired orders`);
  }

  return result.count;
}

/**
 * 检查所有项目余额，低于阈值时推送告警
 *
 * F-IG-05: 每日 dedup（Redis NX EX 86400）。同一项目在同一阈值下 24 小时内
 * 仅触发一次 scheduler-sourced webhook，避免每小时重复打扰。
 * Redis 不可用时 fallback：**不 skip**（宁可重复告警不漏告警）+ warn 日志。
 */
export async function checkBalanceAlerts(): Promise<number> {
  const projects = await prisma.project.findMany({
    where: {
      alertThreshold: { not: null },
    },
    select: {
      id: true,
      name: true,
      alertThreshold: true,
      user: { select: { email: true, balance: true } },
    },
  });

  let alertCount = 0;
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  const redis = getRedis();

  for (const project of projects) {
    const balance = Number(project.user.balance);
    const threshold = Number(project.alertThreshold);

    if (balance > threshold) continue;

    // Dedup: integer microdollars避免浮点 key 歧义，与 triggers.ts 同风格。
    const thresholdMicro = Math.round(threshold * 1_000_000);
    const dedupKey = `alert:balance_low_hourly:${project.id}:${thresholdMicro}`;

    if (redis) {
      const set = await redis.set(dedupKey, "1", "EX", 86400, "NX");
      if (!set) continue; // already alerted within 24h for this project+threshold
    } else {
      console.warn(
        "[billing-scheduler] Redis unavailable — sending alert without dedup (may duplicate)",
      );
    }

    alertCount++;
    console.log(
      `[billing-scheduler] Low balance alert: project ${project.name} (${project.id}), balance: $${balance}, threshold: $${threshold}`,
    );

    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "low_balance_alert",
            projectId: project.id,
            projectName: project.name,
            userEmail: project.user.email,
            balance,
            threshold,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (err) {
        console.error("[billing-scheduler] webhook failed:", (err as Error).message);
      }
    }
  }

  return alertCount;
}
