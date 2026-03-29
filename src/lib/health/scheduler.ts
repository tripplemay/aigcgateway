/**
 * 健康检查调度器
 *
 * 分级频率：
 *   活跃通道（1h 内有调用）→ 10min
 *   备用通道（priority > 1 且 ACTIVE）→ 30min
 *   冷门通道（24h 无调用）→ 2h
 *   DISABLED 通道 → 30min（降频恢复检查）
 *
 * 自动降级与恢复：
 *   单次失败 → 重试 → 仍失败 → DEGRADED
 *   连续 3 次失败 → DISABLED
 *   DISABLED 恢复三级通过 → ACTIVE
 *
 * 记录写入 HealthCheck 表 + 7 天清理
 */

import { PrismaClient } from "@prisma/client";
import type { Channel, ChannelStatus } from "@prisma/client";
import { runHealthCheck, type CheckResult } from "./checker";
import { sendAlert } from "./alert";
import type { RouteResult } from "../engine/types";

const prisma = new PrismaClient();

const FAIL_THRESHOLD = Number(process.env.HEALTH_CHECK_FAIL_THRESHOLD ?? 3);
const ACTIVE_INTERVAL = Number(process.env.HEALTH_CHECK_ACTIVE_INTERVAL_MS ?? 600_000);
const STANDBY_INTERVAL = Number(process.env.HEALTH_CHECK_STANDBY_INTERVAL_MS ?? 1_800_000);
const COLD_INTERVAL = Number(process.env.HEALTH_CHECK_COLD_INTERVAL_MS ?? 7_200_000);
const DISABLED_INTERVAL = 1_800_000; // 30min

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================
// 公共 API
// ============================================================

export function startScheduler(): void {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    runScheduledChecks().catch((err) => {
      console.error("[health-scheduler] error:", err);
    });
  }, 60_000);
  console.log("[health-scheduler] started");
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[health-scheduler] stopped");
  }
}

/**
 * 对单个通道执行完整检查（含重试、降级、记录、告警）
 */
export async function checkChannel(channelId: string): Promise<CheckResult[]> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      provider: { include: { config: true } },
      model: true,
    },
  });

  if (!channel || !channel.provider.config) {
    throw new Error(`Channel ${channelId} not found or missing config`);
  }

  const route: RouteResult = {
    channel,
    provider: channel.provider,
    config: channel.provider.config,
    model: channel.model,
  };

  return executeCheckWithRetry(route);
}

/**
 * 清理 7 天前的 HealthCheck 记录
 */
export async function cleanupOldRecords(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.healthCheck.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

// ============================================================
// 调度逻辑
// ============================================================

async function runScheduledChecks(): Promise<void> {
  const now = Date.now();

  const channels = await prisma.channel.findMany({
    include: {
      provider: { include: { config: true } },
      model: true,
      healthChecks: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  for (const channel of channels) {
    if (!channel.provider.config) continue;

    const lastCheckTime = channel.healthChecks[0]?.createdAt?.getTime() ?? 0;
    const interval = await getCheckInterval(channel);
    const elapsed = now - lastCheckTime;

    if (elapsed < interval) continue;

    const route: RouteResult = {
      channel,
      provider: channel.provider,
      config: channel.provider.config,
      model: channel.model,
    };

    try {
      await executeCheckWithRetry(route);
    } catch (err) {
      console.error(`[health-scheduler] check failed for ${channel.id}:`, err);
    }
  }
}

async function getCheckInterval(channel: Channel): Promise<number> {
  if (channel.status === "DISABLED") return DISABLED_INTERVAL;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCallCount = await prisma.callLog.count({
    where: { channelId: channel.id, createdAt: { gte: oneHourAgo } },
  });
  if (recentCallCount > 0) return ACTIVE_INTERVAL;

  if (channel.priority > 1) return STANDBY_INTERVAL;

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dayCallCount = await prisma.callLog.count({
    where: { channelId: channel.id, createdAt: { gte: oneDayAgo } },
  });
  if (dayCallCount === 0) return COLD_INTERVAL;

  return STANDBY_INTERVAL;
}

// ============================================================
// 检查执行（含重试 + 降级 + 恢复）
// ============================================================

async function executeCheckWithRetry(route: RouteResult): Promise<CheckResult[]> {
  let results = await runHealthCheck(route);
  const allPassed = results.every((r) => r.result === "PASS");

  // 失败 → 重试一次
  if (!allPassed) {
    results = await runHealthCheck(route);
  }

  // 写入 HealthCheck 记录
  await writeHealthRecords(route.channel.id, results);

  // 判定最终结果
  const finalPassed = results.every((r) => r.result === "PASS");

  if (finalPassed) {
    if (route.channel.status !== "ACTIVE") {
      await updateChannelStatus(route, "ACTIVE");
    }
  } else {
    await handleFailure(route);
  }

  return results;
}

async function handleFailure(route: RouteResult): Promise<void> {
  const recentChecks = await prisma.healthCheck.findMany({
    where: { channelId: route.channel.id },
    orderBy: { createdAt: "desc" },
    take: FAIL_THRESHOLD * 3,
    select: { result: true, createdAt: true },
  });

  // 按检查批次分组（同一秒内的为一批）
  const batches: Array<{ hasFail: boolean }> = [];
  let currentBatchTime = 0;
  for (const check of recentChecks) {
    const t = Math.floor(check.createdAt.getTime() / 1000);
    if (t !== currentBatchTime) {
      batches.push({ hasFail: check.result === "FAIL" });
      currentBatchTime = t;
    } else if (check.result === "FAIL") {
      batches[batches.length - 1].hasFail = true;
    }
  }

  const consecutiveFailures = batches.findIndex((b) => !b.hasFail);
  const failCount = consecutiveFailures === -1 ? batches.length : consecutiveFailures;

  if (failCount >= FAIL_THRESHOLD && route.channel.status !== "DISABLED") {
    await updateChannelStatus(route, "DISABLED");
  } else if (route.channel.status === "ACTIVE") {
    await updateChannelStatus(route, "DEGRADED");
  }
}

// ============================================================
// 记录写入
// ============================================================

async function writeHealthRecords(
  channelId: string,
  results: CheckResult[],
): Promise<void> {
  await prisma.healthCheck.createMany({
    data: results.map((r) => ({
      channelId,
      level: r.level,
      result: r.result,
      latencyMs: r.latencyMs,
      errorMessage: r.errorMessage,
      responseBody: r.responseBody,
    })),
  });
}

// ============================================================
// 状态变更 + 告警
// ============================================================

async function updateChannelStatus(
  route: RouteResult,
  newStatus: ChannelStatus,
): Promise<void> {
  const oldStatus = route.channel.status;
  if (oldStatus === newStatus) return;

  await prisma.channel.update({
    where: { id: route.channel.id },
    data: { status: newStatus },
  });

  console.log(
    `[health] ${route.provider.name}/${route.model.name} ${oldStatus} → ${newStatus}`,
  );

  await sendAlert({
    event: "channel_status_changed",
    channelId: route.channel.id,
    providerName: route.provider.name,
    modelName: route.model.name,
    oldStatus,
    newStatus,
    errorMessage: null,
    timestamp: new Date().toISOString(),
  });
}
