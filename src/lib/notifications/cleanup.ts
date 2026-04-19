/**
 * BL-DATA-CONSISTENCY F-DC-03 — notifications expiry sweep.
 *
 * 每日由 leader-locked cron 调用一次；只删 `expiresAt < now` 的 row，
 * `expiresAt IS NULL`（存量 / 不过期事件）不受影响。
 */
import { prisma } from "@/lib/prisma";

export interface CleanupResult {
  deleted: number;
}

export async function cleanupExpiredNotifications(
  now: Date = new Date(),
): Promise<CleanupResult> {
  const result = await prisma.notification.deleteMany({
    where: {
      expiresAt: { lt: now },
    },
  });
  return { deleted: result.count };
}
