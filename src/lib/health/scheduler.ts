/**
 * 健康检查调度器 V2 — 别名感知
 *
 * 按业务价值分级：
 *   已纳入已启用别名 · 文本 · ACTIVE/DEGRADED → 全三级 10min
 *   已纳入已启用别名 · 文本 · DISABLED → 全三级 30min（恢复检查）
 *   已纳入已启用别名 · 图片 · 任意状态 → API_REACHABILITY 10min
 *   未纳入别名 / 别名未启用 · 任意模态 → API_REACHABILITY 10min
 *
 * 即时触发：通道被纳入已启用别名时立即检查
 *
 * 自动降级与恢复：
 *   单次失败 → 重试 → 仍失败 → DEGRADED
 *   连续 3 批次失败 → DISABLED
 *   DISABLED 通道检查通过 → ACTIVE
 */

import { prisma } from "@/lib/prisma";
import type { ChannelStatus } from "@prisma/client";
import { writeSystemLog } from "@/lib/system-logger";
import { runHealthCheck, runApiReachabilityCheck, runCallProbe, type CheckResult } from "./checker";
import { sendAlert } from "./alert";
import type { RouteResult } from "../engine/types";
import { isTransientFailureReason, markChannelCooldown } from "../engine/cooldown";
import { heartbeatLock } from "@/lib/infra/leader-lock";
import {
  sendChannelDownToAdmins,
  sendChannelRecoveredToAdmins,
} from "@/lib/notifications/triggers";

// F-IG-02: keep the scheduler leader lock alive. 70s TTL refreshed every tick
// (60s interval) gives a ~10s grace window if a tick runs long.
const LEADER_KEY = "scheduler";
const LEADER_TTL_SEC = 70;

const FAIL_THRESHOLD = Number(process.env.HEALTH_CHECK_FAIL_THRESHOLD ?? 3);
const ACTIVE_INTERVAL = Number(process.env.HEALTH_CHECK_ACTIVE_INTERVAL_MS ?? 600_000); // 10min
const DISABLED_INTERVAL = Number(process.env.HEALTH_CHECK_DISABLED_INTERVAL_MS ?? 1_800_000); // 30min
const CALL_PROBE_INTERVAL = Number(process.env.CALL_PROBE_INTERVAL_MS ?? 1_800_000); // 30min

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================
// 公共 API
// ============================================================

export function startScheduler(): void {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(async () => {
    // F-IG-02: heartbeat leader lock first. If we lost leadership (Redis
    // expiry, failover), stop the scheduler instead of continuing to run in
    // parallel with whichever replica now holds the lock.
    const stillLeader = await heartbeatLock(LEADER_KEY, LEADER_TTL_SEC).catch(() => false);
    if (!stillLeader) {
      console.warn("[health-scheduler] lost scheduler leadership — stopping");
      stopScheduler();
      return;
    }
    runScheduledChecks().catch((err) => {
      console.error("[health-scheduler] error:", err);
    });
  }, 60_000);
  console.log("[health-scheduler] started (V2 alias-aware)");
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[health-scheduler] stopped");
  }
}

/**
 * 对单个通道执行检查（含重试、降级、记录、告警）
 * 根据通道类型自动选择检查方式
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

  const isImage = channel.model.modality === "IMAGE";
  const isAliased = await isChannelInEnabledAlias(channelId);

  // 文本通道 + 已纳入已启用别名 → 全三级
  // 其他 → API_REACHABILITY
  if (!isImage && isAliased) {
    return executeCheckWithRetry(route, "full");
  }
  return executeCheckWithRetry(route, "reachability");
}

/**
 * F-ACF-10 — CALL_PROBE driver. Runs a minimum-cost real call against one
 * channel, persists the result, and disables the channel after three
 * consecutive CALL_PROBE failures. Skipped when API_REACHABILITY for the
 * same channel is FAIL (cost-savings) or when CALL_PROBE_ENABLED=false.
 */
export async function runCallProbeForChannel(channelId: string): Promise<CheckResult | null> {
  if ((process.env.CALL_PROBE_ENABLED ?? "true").toLowerCase() === "false") {
    return null;
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      provider: { include: { config: true } },
      model: true,
    },
  });
  if (!channel || !channel.provider.config) return null;

  // Cost guard: if the most recent API_REACHABILITY check is FAIL, skip.
  const lastReach = await prisma.healthCheck.findFirst({
    where: { channelId, level: "API_REACHABILITY" },
    orderBy: { createdAt: "desc" },
  });
  if (lastReach && lastReach.result === "FAIL") return null;

  const route: RouteResult = {
    channel,
    provider: channel.provider,
    config: channel.provider.config,
    model: channel.model,
  };

  const result = await runCallProbe(route);
  await writeHealthRecords(channelId, [result]);

  if (result.result === "FAIL") {
    // F-RR2-05: skip the 3-consecutive-fail DISABLE escalation when the
    // failures are transient (429 / timeout / 限流). Write a cooldown
    // instead so routeByAlias de-prioritizes but still keeps the
    // channel discoverable.
    if (isTransientFailureReason(result.errorMessage)) {
      void markChannelCooldown(channelId, "call_probe_transient");
    } else {
      const recent = await prisma.healthCheck.findMany({
        where: { channelId, level: "CALL_PROBE" },
        orderBy: { createdAt: "desc" },
        take: 3,
      });
      const allPermanentFail =
        recent.length === 3 &&
        recent.every((r) => r.result === "FAIL" && !isTransientFailureReason(r.errorMessage));
      if (allPermanentFail && channel.status !== "DISABLED") {
        await updateChannelStatus(route, "DISABLED");
      }
    }
  }

  return result;
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
// 别名查询
// ============================================================

async function isChannelInEnabledAlias(channelId: string): Promise<boolean> {
  const count = await prisma.aliasModelLink.count({
    where: {
      model: {
        channels: { some: { id: channelId } },
      },
      alias: { enabled: true },
    },
  });
  return count > 0;
}

/** 批量查询：哪些 channel 被纳入已启用别名 */
async function getAliasedChannelIds(): Promise<Set<string>> {
  const links = await prisma.aliasModelLink.findMany({
    where: { alias: { enabled: true } },
    select: {
      model: {
        select: {
          channels: { select: { id: true } },
        },
      },
    },
  });
  const ids = new Set<string>();
  for (const link of links) {
    for (const ch of link.model.channels) {
      ids.add(ch.id);
    }
  }
  return ids;
}

// ============================================================
// 调度逻辑
// ============================================================

const MAX_CHECKS_PER_ROUND = 20;

// Exported for unit tests — pure decision for which check strategy each
// channel should receive on the current tick.
export type CheckMode = "full" | "reachability";
export interface CheckPlan {
  checkMode: CheckMode;
  interval: number;
}

export function planChannelCheck(
  channel: { status: string; model: { modality: string } },
  isAliased: boolean,
): CheckPlan {
  const isImage = channel.model.modality === "IMAGE";
  if (isAliased && !isImage) {
    // BL-HEALTH-PROBE-EMERGENCY F-HPE-01: DISABLED text channels run
    // zero-cost reachability only; the old 'full' path silently billed
    // upstream providers (chatanywhere 2026-04-16 = 535 calls / $11.71).
    // Fix round 1's DISABLED→DEGRADED auto-recovery (handleFailure
    // allTransient branch) still applies: reachability success/failure
    // still flows through executeCheckWithRetry → handleFailure.
    if (channel.status === "DISABLED") {
      return { checkMode: "reachability", interval: DISABLED_INTERVAL };
    }
    return { checkMode: "full", interval: ACTIVE_INTERVAL };
  }
  // Image channels or un-aliased channels: reachability only.
  return { checkMode: "reachability", interval: ACTIVE_INTERVAL };
}

// Exported for unit tests — pure filter deciding whether a channel is
// eligible for a CALL_PROBE this tick.
export function shouldCallProbeChannel(
  ch: { id: string; status: string; model: { modality: string } },
  aliasedIds: Set<string>,
): boolean {
  if (ch.model.modality === "IMAGE") return false;
  if (!aliasedIds.has(ch.id)) return false;
  // BL-HEALTH-PROBE-EMERGENCY F-HPE-02: never probe DISABLED channels —
  // CALL_PROBE makes a real billable call.
  if (ch.status === "DISABLED") return false;
  return true;
}

async function runScheduledChecks(): Promise<void> {
  const now = Date.now();

  // F-RR-01: Only check channels that belong to models linked to an enabled
  // alias. Orphan channels (synced but never aliased) are skipped to avoid
  // wasting check budget (~330 orphans vs ~71 aliased).
  const aliasedIds = await getAliasedChannelIds();

  const channels = await prisma.channel.findMany({
    where: {
      model: { enabled: true },
      id: { in: [...aliasedIds] },
    },
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

  const dueChannels: Array<{
    route: RouteResult;
    checkMode: "full" | "reachability";
  }> = [];

  for (const channel of channels) {
    if (!channel.provider.config) continue;
    if (dueChannels.length >= MAX_CHECKS_PER_ROUND) break;

    const lastCheckTime = channel.healthChecks[0]?.createdAt?.getTime() ?? 0;
    const elapsed = now - lastCheckTime;

    const { checkMode, interval } = planChannelCheck(channel, aliasedIds.has(channel.id));

    if (elapsed < interval) continue;

    dueChannels.push({
      route: {
        channel,
        provider: channel.provider,
        config: channel.provider.config,
        model: channel.model,
      },
      checkMode,
    });
  }

  for (const { route, checkMode } of dueChannels) {
    try {
      await executeCheckWithRetry(route, checkMode);
    } catch (err) {
      console.error(`[health-scheduler] check failed for ${route.channel.id}:`, err);
    }
  }

  // F-AF2-02: run CALL_PROBE for aliased text channels on a longer interval.
  // CALL_PROBE makes a real (minimum-cost) API call to verify end-to-end
  // availability, so it runs less frequently than the zero-cost checks above.
  await runScheduledCallProbes(now, channels, aliasedIds);
}

const MAX_PROBES_PER_ROUND = 5;

async function runScheduledCallProbes(
  now: number,
  channels: Array<{
    id: string;
    status: string;
    model: { modality: string; enabled: boolean };
    healthChecks: Array<{ createdAt: Date }>;
  }>,
  aliasedIds: Set<string>,
): Promise<void> {
  if ((process.env.CALL_PROBE_ENABLED ?? "true").toLowerCase() === "false") return;

  // Find aliased text channels due for a CALL_PROBE
  const probeChannelIds: string[] = [];
  for (const ch of channels) {
    if (probeChannelIds.length >= MAX_PROBES_PER_ROUND) break;
    if (!shouldCallProbeChannel(ch, aliasedIds)) continue;

    // Check last CALL_PROBE time from DB
    probeChannelIds.push(ch.id);
  }

  if (probeChannelIds.length === 0) return;

  // Query last CALL_PROBE timestamps in batch
  const lastProbes = await prisma.healthCheck.findMany({
    where: {
      channelId: { in: probeChannelIds },
      level: "CALL_PROBE",
    },
    orderBy: { createdAt: "desc" },
    distinct: ["channelId"],
    select: { channelId: true, createdAt: true },
  });
  const lastProbeMap = new Map(lastProbes.map((p) => [p.channelId, p.createdAt.getTime()]));

  for (const channelId of probeChannelIds) {
    const lastTime = lastProbeMap.get(channelId) ?? 0;
    if (now - lastTime < CALL_PROBE_INTERVAL) continue;

    try {
      await runCallProbeForChannel(channelId);
    } catch (err) {
      console.error(`[health-scheduler] CALL_PROBE failed for ${channelId}:`, err);
    }
  }
}

// ============================================================
// 检查执行（含重试 + 降级 + 恢复）
// ============================================================

async function executeCheckWithRetry(
  route: RouteResult,
  checkMode: "full" | "reachability",
): Promise<CheckResult[]> {
  const runCheck =
    checkMode === "full" ? () => runHealthCheck(route) : () => runApiReachabilityCheck(route);

  let results = await runCheck();
  const allPassed = results.every((r) => r.result === "PASS");

  // 失败 → 重试一次
  if (!allPassed) {
    results = await runCheck();
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
    await handleFailure(route, results);
  }

  return results;
}

async function handleFailure(route: RouteResult, results: CheckResult[]): Promise<void> {
  // F-RR2-05: transient failures (429, timeout, 限流) must NOT trip the
  // 3-batch auto-DISABLE path — they're handled by the 300 s Redis
  // cooldown instead. Permanent failures (401 with bad key, 5xx that
  // don't resolve) keep the existing escalation. If *any* probe in
  // this batch surfaced a non-transient reason, treat the batch as
  // permanent.
  const failedReasons = results.filter((r) => r.result === "FAIL").map((r) => r.errorMessage);
  const allTransient =
    failedReasons.length > 0 && failedReasons.every((msg) => isTransientFailureReason(msg));

  if (allTransient) {
    // Mark a cooldown so routeByAlias de-prioritizes this channel for the
    // next 5 minutes. Written whether the channel is ACTIVE or DEGRADED;
    // the health scheduler is the only detection path for idle periods.
    void markChannelCooldown(route.channel.id, "health_transient");
    if (route.channel.status === "ACTIVE") {
      await updateChannelStatus(route, "DEGRADED");
    } else if (route.channel.status === "DISABLED") {
      // F-RR2-06: a previously DISABLED channel surfacing a transient
      // (rate_limit / timeout) failure is a signal the upstream is up
      // and responding — just currently throttled. Reopen it to DEGRADED
      // so routeByAlias starts including it again (sunk to the demoted
      // band). Without this, a channel that gets DISABLED before the fix
      // round 1 deploy would need manual `UPDATE status='ACTIVE'` to
      // recover, because health-check PASS is unreachable while the
      // upstream keeps rate-limiting the probe.
      await updateChannelStatus(route, "DEGRADED");
    }
    return;
  }

  const recentChecks = await prisma.healthCheck.findMany({
    where: { channelId: route.channel.id },
    orderBy: { createdAt: "desc" },
    take: FAIL_THRESHOLD * 3,
    select: { result: true, errorMessage: true, createdAt: true },
  });

  // 按检查批次分组（同一秒内的为一批）— 只有"非 transient"失败批次才计入
  // DISABLE 阈值，避免连续 429 把一个临时被限流的通道永久 DISABLE。
  const batches: Array<{ hasFail: boolean; allTransient: boolean }> = [];
  let currentBatchTime = 0;
  for (const check of recentChecks) {
    const t = Math.floor(check.createdAt.getTime() / 1000);
    if (t !== currentBatchTime) {
      batches.push({
        hasFail: check.result === "FAIL",
        allTransient: check.result === "FAIL" ? isTransientFailureReason(check.errorMessage) : true,
      });
      currentBatchTime = t;
    } else if (check.result === "FAIL") {
      batches[batches.length - 1].hasFail = true;
      if (!isTransientFailureReason(check.errorMessage)) {
        batches[batches.length - 1].allTransient = false;
      }
    }
  }

  const consecutivePermFailures = batches.findIndex((b) => !b.hasFail || b.allTransient);
  const permFailCount = consecutivePermFailures === -1 ? batches.length : consecutivePermFailures;

  if (permFailCount >= FAIL_THRESHOLD && route.channel.status !== "DISABLED") {
    await updateChannelStatus(route, "DISABLED");
  } else if (route.channel.status === "ACTIVE") {
    await updateChannelStatus(route, "DEGRADED");
  }
}

// ============================================================
// 记录写入
// ============================================================

async function writeHealthRecords(channelId: string, results: CheckResult[]): Promise<void> {
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

async function updateChannelStatus(route: RouteResult, newStatus: ChannelStatus): Promise<void> {
  const oldStatus = route.channel.status;
  if (oldStatus === newStatus) return;

  await prisma.channel.update({
    where: { id: route.channel.id },
    data: { status: newStatus },
  });

  console.log(`[health] ${route.provider.name}/${route.model.name} ${oldStatus} → ${newStatus}`);

  // F-AO2-03: persist every state transition to SystemLog. A DISABLED →
  // ACTIVE flip is classified as AUTO_RECOVERY so operators can filter
  // the admin/logs tab by recovery events; every other transition lands
  // in the HEALTH_CHECK bucket.
  const isRecovery = oldStatus === "DISABLED" && newStatus === "ACTIVE";
  const level: "INFO" | "WARN" | "ERROR" =
    newStatus === "DISABLED" ? "ERROR" : newStatus === "DEGRADED" ? "WARN" : "INFO";
  await writeSystemLog(
    isRecovery ? "AUTO_RECOVERY" : "HEALTH_CHECK",
    level,
    `${route.provider.name}/${route.model.name}: ${oldStatus} → ${newStatus}`,
    {
      channelId: route.channel.id,
      providerName: route.provider.name,
      modelName: route.model.name,
      prevStatus: oldStatus,
      newStatus,
    },
  ).catch((err) => console.error("[health] writeSystemLog failed:", err));

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

  // F-UA-04: notify admins on PASS→FAIL (→DISABLED) and AUTO_RECOVERY
  if (newStatus === "DISABLED") {
    sendChannelDownToAdmins({
      channelId: route.channel.id,
      providerName: route.provider.name,
      modelName: route.model.name,
    }).catch(() => {});
  } else if (isRecovery) {
    sendChannelRecoveredToAdmins({
      channelId: route.channel.id,
      providerName: route.provider.name,
      modelName: route.model.name,
    }).catch(() => {});
  }
}
