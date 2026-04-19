/**
 * BL-INFRA-ARCHIVE F-IA-01 — retention sweeps for observability tables.
 *
 * Scope chosen from 2026-04-20 production snapshot:
 *   - health_checks  ≈ 109K rows / 42 MB / +400K/month → 30 day TTL
 *   - system_logs    ≈ 930 rows / 536 kB → 90 day TTL
 *
 * call_logs (≈ 721 rows) is not touched here — business growth has not
 * reached a threshold where partitioning pays off. Revisit when volume
 * crosses ~100K or index size starts to show in query plans.
 *
 * notifications TTL is already covered by BL-DATA-CONSISTENCY
 * (src/lib/notifications/cleanup.ts) and re-invoked from the shared
 * scheduler tick in ./scheduler.ts.
 */
import { prisma } from "@/lib/prisma";

export const RETENTION_DAYS = {
  health_checks: 30,
  system_logs: 90,
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
