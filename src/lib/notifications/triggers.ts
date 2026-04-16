/**
 * F-UA-03: Event trigger helpers — BALANCE_LOW
 *
 * Extracted from post-process.ts so the dedup+dispatch logic is unit-testable
 * without spinning up the full request pipeline.
 */

import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { sendNotification } from "./dispatcher";

/**
 * Called after every successful balance deduction.
 * If the user's balance has dropped below the project's alertThreshold,
 * fires a BALANCE_LOW notification — at most once per 24 hours per threshold
 * value (Redis NX dedup key).
 */
export async function checkAndSendBalanceLowAlert(
  userId: string,
  projectId: string,
): Promise<void> {
  try {
    const [user, project] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { balance: true } }),
      prisma.project.findUnique({ where: { id: projectId }, select: { alertThreshold: true } }),
    ]);

    if (!user || !project?.alertThreshold) return;

    const balance = Number(user.balance);
    const threshold = Number(project.alertThreshold);

    if (balance >= threshold) return;

    // Dedup key uses integer microdollars to avoid float key ambiguity.
    const thresholdMicro = Math.round(threshold * 1_000_000);
    const dedupKey = `alert:balance_low:${userId}:${thresholdMicro}`;
    const redis = getRedis();
    if (redis) {
      // SET EX NX — atomic: write only if key absent, expire in 24 h
      const set = await redis.set(dedupKey, "1", "EX", 86400, "NX");
      if (!set) return; // already notified within 24 h
    }

    sendNotification(
      userId,
      "BALANCE_LOW",
      { currentBalance: balance, threshold, projectId },
      projectId,
    ).catch((err) => {
      console.error("[triggers] BALANCE_LOW notification failed:", err);
    });
  } catch (err) {
    console.error("[triggers] checkAndSendBalanceLowAlert error:", err);
  }
}
