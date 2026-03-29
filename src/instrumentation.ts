/**
 * Next.js Instrumentation — 应用启动时执行
 *
 * 启动定时任务：
 * 1. 健康检查调度器（分级频率）
 * 2. 计费调度器（过期订单关闭 + 余额告警）
 * 3. 每日清理 7 天前的 HealthCheck 记录
 */

export async function register() {
  // 仅在 Node.js server 运行时启动（不在 edge runtime 或 build 时）
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler, cleanupOldRecords } = await import("@/lib/health/scheduler");
    const { startBillingScheduler } = await import("@/lib/billing/scheduler");

    // 启动健康检查调度器
    startScheduler();

    // 启动计费调度器（过期订单 + 余额告警）
    startBillingScheduler();

    // 每日清理 7 天前的 HealthCheck 记录（每 24 小时执行一次）
    setInterval(() => {
      cleanupOldRecords()
        .then((count) => {
          if (count > 0) console.log(`[cleanup] Deleted ${count} old health check records`);
        })
        .catch((err) => console.error("[cleanup] error:", err));
    }, 24 * 60 * 60 * 1000);

    console.log("[instrumentation] Schedulers started");
  }
}
