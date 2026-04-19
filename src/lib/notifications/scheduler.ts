/**
 * BL-DATA-CONSISTENCY F-DC-03 — notifications cleanup scheduler.
 *
 * 调度由 instrumentation.ts 在 leader-lock acquire 成功后启动（仅 leader
 * 节点运行，避免多副本重复 deleteMany）。24h interval。
 */
import { cleanupExpiredNotifications } from "./cleanup";

const DAY_MS = 24 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { deleted } = await cleanupExpiredNotifications();
    if (deleted > 0) {
      console.log(`[notifications-cleanup] deleted ${deleted} expired notifications`);
    }
  } catch (err) {
    console.error("[notifications-cleanup] error:", err);
  }
}

export function startNotificationsCleanupScheduler(): void {
  if (timer) return;
  // 启动时跑一次（若有大量历史过期条目立即清理），之后每 24h 一次。
  void tick();
  timer = setInterval(() => void tick(), DAY_MS);
  console.log("[notifications-cleanup] scheduler started (24h interval)");
}

export function stopNotificationsCleanupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
