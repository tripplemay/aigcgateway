/**
 * BL-INFRA-ARCHIVE F-IA-01 — unified maintenance scheduler.
 *
 * Replaces the earlier single-task notifications scheduler with a fan-out
 * tick that runs all three retention sweeps (notifications / health_checks /
 * system_logs) on the same 24h cadence. Every sweep is try/catched so one
 * failure does not mask the others.
 *
 * Invoked by instrumentation.ts *after* leader-lock acquisition, so only
 * one replica executes the deletes per cluster.
 */
import { cleanupExpiredNotifications } from "@/lib/notifications/cleanup";
import { cleanupHealthChecks, cleanupSystemLogs, cleanupCallLogs } from "./archive-cleanup";
import { runReconciliation } from "@/lib/billing-audit/reconcile-job";

const DAY_MS = 24 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

async function runOne<T>(label: string, fn: () => Promise<T>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[maintenance] ${label} failed:`, err);
  }
}

/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-02 / F-BAP2-04: 把 call_logs cleanup 加到
 * tick；reconciliation 每日跑一次（按 spec 04:30 UTC，实际由首次启动时点
 * 决定，间隔 24h 即可满足"每日一次"的对账语义）。
 */
async function tick(): Promise<void> {
  await Promise.all([
    runOne("notifications-cleanup", () => cleanupExpiredNotifications()),
    runOne("health-checks-cleanup", () => cleanupHealthChecks()),
    runOne("system-logs-cleanup", () => cleanupSystemLogs()),
    runOne("call-logs-cleanup", () => cleanupCallLogs()),
    runOne("billing-reconciliation", () => runReconciliation(yesterdayUtc())),
  ]);
}

/**
 * 对账目标日 = UTC 昨天（reportDate 用 DATE 类型 @db.Date）。
 * 这样每天 cron 跑都对完整的"昨日"数据，不会跨天误差。
 */
function yesterdayUtc(now: Date = new Date()): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return new Date(Date.UTC(y, m, d - 1));
}

export function startMaintenanceScheduler(): () => void {
  if (timer) return stopMaintenanceScheduler;
  // Kick once on startup so any drift accumulated since last boot is
  // swept promptly; then every 24h.
  void tick();
  timer = setInterval(() => void tick(), DAY_MS);
  console.log("[maintenance] scheduler started (24h interval)");
  return stopMaintenanceScheduler;
}

export function stopMaintenanceScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Exposed for tests that need to exercise a single tick without waiting
// for the 24h interval.
export const __maintenanceTickForTest = tick;
