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
import { cleanupHealthChecks, cleanupSystemLogs } from "./archive-cleanup";

const DAY_MS = 24 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

async function runOne<T>(label: string, fn: () => Promise<T>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[maintenance] ${label} failed:`, err);
  }
}

async function tick(): Promise<void> {
  await Promise.all([
    runOne("notifications-cleanup", () => cleanupExpiredNotifications()),
    runOne("health-checks-cleanup", () => cleanupHealthChecks()),
    runOne("system-logs-cleanup", () => cleanupSystemLogs()),
  ]);
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
