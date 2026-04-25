/**
 * BL-INFRA-ARCHIVE F-IA-01 — retention sweeps for observability tables.
 *
 * Scope chosen from 2026-04-20 production snapshot:
 *   - health_checks  ≈ 109K rows / 42 MB / +400K/month → 30 day TTL
 *   - system_logs    ≈ 930 rows / 536 kB → 90 day TTL
 *   - call_logs      ≈ 721 rows base; BL-BILLING-AUDIT-EXT-P2 F-BAP2-04
 *     adds 30 day TTL because probe / sync writes pushed steady state to
 *     ~1500 rows/day and对账 cron only需要近 30 天明细。
 *
 * notifications TTL is already covered by BL-DATA-CONSISTENCY
 * (src/lib/notifications/cleanup.ts) and re-invoked from the shared
 * scheduler tick in ./scheduler.ts.
 */
import { prisma } from "@/lib/prisma";

export const RETENTION_DAYS = {
  health_checks: 30,
  system_logs: 90,
  call_logs: 30,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  deleted: number;
}

export async function cleanupHealthChecks(now: Date = new Date()): Promise<CleanupResult> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.health_checks * DAY_MS);
  const result = await prisma.healthCheck.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (result.count > 0) {
    console.log(
      `[archive] health_checks: deleted ${result.count} rows older than ${RETENTION_DAYS.health_checks}d`,
    );
  }
  return { deleted: result.count };
}

export async function cleanupSystemLogs(now: Date = new Date()): Promise<CleanupResult> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.system_logs * DAY_MS);
  const result = await prisma.systemLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (result.count > 0) {
    console.log(
      `[archive] system_logs: deleted ${result.count} rows older than ${RETENTION_DAYS.system_logs}d`,
    );
  }
  return { deleted: result.count };
}

/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-04 — call_logs 30 天 TTL。
 * 对账只用 30 天内明细；老数据已沉淀到 bill_reconciliation 表。
 */
export async function cleanupCallLogs(now: Date = new Date()): Promise<CleanupResult> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.call_logs * DAY_MS);
  const result = await prisma.callLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (result.count > 0) {
    console.log(
      `[archive] call_logs: deleted ${result.count} rows older than ${RETENTION_DAYS.call_logs}d`,
    );
  }
  return { deleted: result.count };
}
