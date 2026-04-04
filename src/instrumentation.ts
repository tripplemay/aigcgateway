/**
 * Next.js Instrumentation — 应用启动时执行
 *
 * 启动定时任务：
 * 1. 健康检查调度器（分级频率）
 * 2. 计费调度器（过期订单关闭 + 余额告警）
 * 3. 每日清理 7 天前的 HealthCheck 记录
 * 4. 模型自动同步（启动时 + 每天 04:00）
 */

export async function register() {
  // 仅在 Node.js server 运行时启动（不在 edge runtime 或 build 时）
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // PM2 cluster 模式下，只让 worker 0 执行定时任务，避免多进程重复执行
    const isWorkerZero =
      process.env.NODE_APP_INSTANCE === "0" || process.env.NODE_APP_INSTANCE === undefined; // 单进程模式也能跑

    if (!isWorkerZero) {
      console.log(`[instrumentation] Worker ${process.env.NODE_APP_INSTANCE} — skip schedulers`);
      return;
    }

    const { prisma } = await import("@/lib/prisma");
    const { startScheduler, cleanupOldRecords } = await import("@/lib/health/scheduler");
    const { startBillingScheduler } = await import("@/lib/billing/scheduler");
    const { startModelSyncScheduler } = await import("@/lib/sync/scheduler");

    // 预热 Prisma 连接池，避免首次请求冷启动延迟
    prisma
      .$connect()
      .catch((err: unknown) => console.error("[instrumentation] prisma connect error:", err));

    // 启动健康检查调度器
    startScheduler();

    // 启动计费调度器（过期订单 + 余额告警）
    startBillingScheduler();

    // 每日清理 7 天前的 HealthCheck 记录（每 24 小时执行一次）
    setInterval(
      () => {
        cleanupOldRecords()
          .then((count) => {
            if (count > 0) console.log(`[cleanup] Deleted ${count} old health check records`);
          })
          .catch((err) => console.error("[cleanup] error:", err));
      },
      24 * 60 * 60 * 1000,
    );

    // 启动模型同步调度器（启动时同步 + 每天 04:00 定时同步）
    startModelSyncScheduler();

    // 每小时扫描并吊销过期 API Key
    setInterval(
      async () => {
        try {
          const result = await prisma.apiKey.updateMany({
            where: {
              status: "ACTIVE",
              expiresAt: { lt: new Date() },
            },
            data: { status: "REVOKED" },
          });
          if (result.count > 0) {
            console.log(`[key-expiry] Auto-revoked ${result.count} expired keys`);
          }
        } catch (err) {
          console.error("[key-expiry] error:", err);
        }
      },
      60 * 60 * 1000,
    );

    console.log("[instrumentation] Worker 0 — schedulers started");
  }
}
