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
    // 启动时 fail-fast：IMAGE_PROXY_SECRET 家族必须至少一个有值
    const { assertImageProxySecret } = await import("@/lib/env");
    assertImageProxySecret();

    // F-IG-02: Redis leader lock decides which replica runs the schedulers.
    // This replaces the old `NODE_APP_INSTANCE === "0"` check, which Docker
    // multi-replica deployments all evaluated to `undefined` → every replica
    // ran the schedulers in parallel.
    const { acquireLeaderLock, releaseLeaderLock } = await import("@/lib/infra/leader-lock");
    const LEADER_KEY = "scheduler";
    const LEADER_TTL_SEC = 70; // heartbeat every 30s refreshes this (see health/scheduler.ts)

    const gotLeadership = await acquireLeaderLock(LEADER_KEY, LEADER_TTL_SEC);
    if (!gotLeadership) {
      console.log("[instrumentation] another replica holds scheduler leadership — skip");
      return;
    }

    // Release on graceful shutdown so a replacement replica can take over fast.
    const handleShutdown = (signal: string) => {
      releaseLeaderLock(LEADER_KEY)
        .catch(() => {})
        .finally(() => {
          console.log(`[instrumentation] released scheduler lock on ${signal}`);
        });
    };
    process.once("SIGTERM", () => handleShutdown("SIGTERM"));
    process.once("SIGINT", () => handleShutdown("SIGINT"));

    const { prisma } = await import("@/lib/prisma");
    const { getRedis } = await import("@/lib/redis");
    const { startScheduler, cleanupOldRecords } = await import("@/lib/health/scheduler");
    const { startBillingScheduler } = await import("@/lib/billing/scheduler");
    const { startModelSyncScheduler } = await import("@/lib/sync/scheduler");

    // 预热 Prisma 连接池，避免首次请求冷启动延迟
    prisma
      .$connect()
      .catch((err: unknown) => console.error("[instrumentation] prisma connect error:", err));

    // 检查 Redis 可用性（redis.ts 在 import 时已自动建连，这里只打日志）
    const redis = getRedis();
    console.log(
      `[instrumentation] Redis: ${redis ? "connected" : "not available (REDIS_URL missing or connection failed)"}`,
    );

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

    console.log("[instrumentation] scheduler leader — all background jobs started");
  }
}
