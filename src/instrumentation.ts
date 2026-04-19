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

    const { prisma } = await import("@/lib/prisma");

    // 预热 Prisma 连接池，避免首次请求冷启动延迟
    prisma
      .$connect()
      .catch((err: unknown) => console.error("[instrumentation] prisma connect error:", err));

    // F-IG-02 fix round 1: Redis leader lock decides which replica runs the
    // schedulers. The fix-round-0 implementation allowed an in-process
    // fallback when Redis was not ready at startup, which produced a race:
    // both replicas fallback-acquired, then both lost leadership the moment
    // Redis came up and heartbeat couldn't find a matching key.
    //
    // New rule: wait up to 5s for Redis. If Redis is not ready, disable all
    // schedulers on this node. acquire/heartbeat/release then share a single
    // source of truth (Redis) for the lifetime of the process.
    const { waitForRedisReady } = await import("@/lib/redis");
    const redisReady = await waitForRedisReady(5000);
    if (!redisReady) {
      console.warn(
        "[instrumentation] scheduler disabled — Redis not ready within 5s. No background jobs will run on this node.",
      );
      return;
    }

    const { acquireLeaderLock, releaseLeaderLock } = await import("@/lib/infra/leader-lock");
    const LEADER_KEY = "scheduler";
    const LEADER_TTL_SEC = 70; // heartbeat every 60s refreshes this (see health/scheduler.ts)

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

    const { startScheduler, cleanupOldRecords } = await import("@/lib/health/scheduler");
    const { startBillingScheduler } = await import("@/lib/billing/scheduler");
    const { startModelSyncScheduler } = await import("@/lib/sync/scheduler");
    const { startNotificationsCleanupScheduler } = await import("@/lib/notifications/scheduler");

    console.log("[instrumentation] Redis ready, leadership acquired");

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

    // BL-DATA-CONSISTENCY F-DC-03: 每日清理过期通知（expiresAt < now）
    startNotificationsCleanupScheduler();

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
