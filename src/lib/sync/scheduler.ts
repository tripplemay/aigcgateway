/**
 * 模型同步调度器
 *
 * - 应用启动时延迟 10s 执行一次完整同步（不阻塞启动）
 * - 每分钟检查一次，如果当前时间为 04:00 则执行同步
 */

import { runModelSync } from "./model-sync";

const SYNC_HOUR = 4; // 每天凌晨 4:00
const CHECK_INTERVAL = 60_000; // 每分钟检查一次
let lastSyncDate = ""; // 防止同一天重复触发

export function startModelSyncScheduler() {
  // 启动时延迟 10s 执行一次（不阻塞应用启动）
  setTimeout(() => {
    console.log("[model-sync] Running initial sync on startup...");
    runModelSync()
      .then((result) => {
        console.log(
          `[model-sync] Initial sync done in ${result.durationMs}ms: ` +
            `+${result.summary.totalNewChannels} new, ` +
            `-${result.summary.totalDisabledChannels} disabled, ` +
            `${result.summary.totalFailedProviders} failed`,
        );
      })
      .catch((err) => console.error("[model-sync] Initial sync error:", err));
  }, 10_000);

  // 定时检查：每分钟检查，04:00 执行
  setInterval(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();

    if (hour === SYNC_HOUR && lastSyncDate !== todayStr) {
      lastSyncDate = todayStr;
      console.log("[model-sync] Running scheduled daily sync...");
      runModelSync()
        .then((result) => {
          console.log(
            `[model-sync] Daily sync done in ${result.durationMs}ms: ` +
              `+${result.summary.totalNewChannels} new, ` +
              `-${result.summary.totalDisabledChannels} disabled`,
          );
        })
        .catch((err) => console.error("[model-sync] Daily sync error:", err));
    }
  }, CHECK_INTERVAL);

  console.log("[model-sync] Scheduler started (daily at 04:00 UTC)");
}
