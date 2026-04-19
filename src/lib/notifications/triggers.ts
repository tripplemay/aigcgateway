/**
 * F-UA-03/04: Event trigger helpers
 *
 * Centralised module for all "event source → sendNotification" bridges.
 * Keeping trigger logic here makes each call-site a one-liner and keeps
 * the dedup + admin-lookup patterns testable in isolation.
 */

import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { sendNotification } from "./dispatcher";

// ============================================================
// Shared: get all ADMIN user IDs
// ============================================================

async function getAdminUserIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

// ============================================================
// F-UA-03: BALANCE_LOW (24-hour dedup per userId + threshold)
// ============================================================

/**
 * Called after every successful balance deduction.
 * If the user's balance has dropped below the project's alertThreshold,
 * fires a BALANCE_LOW notification — at most once per 24 hours per threshold
 * value (Redis NX dedup key).
 */
export async function checkAndSendBalanceLowAlert(
  userId: string,
  projectOrId:
    | string
    | { id: string; alertThreshold: import("@prisma/client").Prisma.Decimal | number | null },
): Promise<void> {
  try {
    const projectId = typeof projectOrId === "string" ? projectOrId : projectOrId.id;
    // BL-INFRA-RESILIENCE F-IR-03 / H-6: reuse the project row if caller
    // already fetched it (post-process does) to avoid a second findUnique.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    const project =
      typeof projectOrId === "string"
        ? await prisma.project.findUnique({
            where: { id: projectId },
            select: { alertThreshold: true },
          })
        : { alertThreshold: projectOrId.alertThreshold };

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

// ============================================================
// F-UA-04: CHANNEL_DOWN (6-hour dedup per channelId)
// ============================================================

/**
 * Called when a channel transitions to DISABLED.
 * Notifies all ADMIN users; deduped per channelId for 6 hours so a
 * flapping channel does not spam.
 */
export async function sendChannelDownToAdmins(params: {
  channelId: string;
  providerName: string;
  modelName: string;
  lastError?: string | null;
}): Promise<void> {
  try {
    const dedupKey = `alert:channel_down:${params.channelId}`;
    const redis = getRedis();
    if (redis) {
      const set = await redis.set(dedupKey, "1", "EX", 21600, "NX"); // 6 h
      if (!set) return; // already notified within 6 h
    }

    const adminIds = await getAdminUserIds();
    if (adminIds.length === 0) return;

    const payload = {
      channelId: params.channelId,
      providerName: params.providerName,
      modelName: params.modelName,
      lastError: params.lastError ?? null,
    };

    await Promise.all(
      adminIds.map((adminId) =>
        sendNotification(adminId, "CHANNEL_DOWN", payload).catch((err) => {
          console.error(`[triggers] CHANNEL_DOWN to admin ${adminId} failed:`, err);
        }),
      ),
    );
  } catch (err) {
    console.error("[triggers] sendChannelDownToAdmins error:", err);
  }
}

// ============================================================
// F-UA-04: CHANNEL_RECOVERED (no dedup — recovery is always relevant)
// ============================================================

/**
 * Called when a DISABLED channel recovers to ACTIVE (AUTO_RECOVERY).
 * No dedup — admins should always know when a channel comes back.
 */
export async function sendChannelRecoveredToAdmins(params: {
  channelId: string;
  providerName: string;
  modelName: string;
}): Promise<void> {
  try {
    const adminIds = await getAdminUserIds();
    if (adminIds.length === 0) return;

    const payload = {
      channelId: params.channelId,
      providerName: params.providerName,
      modelName: params.modelName,
    };

    await Promise.all(
      adminIds.map((adminId) =>
        sendNotification(adminId, "CHANNEL_RECOVERED", payload).catch((err) => {
          console.error(`[triggers] CHANNEL_RECOVERED to admin ${adminId} failed:`, err);
        }),
      ),
    );
  } catch (err) {
    console.error("[triggers] sendChannelRecoveredToAdmins error:", err);
  }
}

// ============================================================
// F-UA-04: PENDING_CLASSIFICATION (aggregated after classifier batch)
// ============================================================

interface PendingExample {
  modelName: string;
  suggestedAlias: string | null;
  confidence: number;
}

/**
 * Called at the end of classifyUnlinkedModels() when pendingQueued > 0.
 * Queries the most-recent PENDING items (up to 5) for the payload examples,
 * then notifies all ADMIN users with an aggregated summary.
 */
export async function sendPendingClassificationToAdmins(count: number): Promise<void> {
  if (count <= 0) return;
  try {
    const adminIds = await getAdminUserIds();
    if (adminIds.length === 0) return;

    // Pull up to 5 most-recent PENDING items for examples
    const recent = await prisma.pendingClassification.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { model: { select: { name: true } } },
    });

    const examples: PendingExample[] = recent.map((r) => ({
      modelName: r.model.name,
      suggestedAlias: r.suggestedAlias,
      confidence: Number(r.confidence),
    }));

    const payload = { count, examples };

    await Promise.all(
      adminIds.map((adminId) =>
        sendNotification(adminId, "PENDING_CLASSIFICATION", payload).catch((err) => {
          console.error(`[triggers] PENDING_CLASSIFICATION to admin ${adminId} failed:`, err);
        }),
      ),
    );
  } catch (err) {
    console.error("[triggers] sendPendingClassificationToAdmins error:", err);
  }
}
