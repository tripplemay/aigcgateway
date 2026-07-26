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
// BL-DEEPSEEK-V4-HOTFIX fix_round 1 / DSV4-DEF-01 — 去重窗口只对
// 「真的送出去了」的通知生效
// ============================================================

/**
 * 缺陷现场：原来每个 trigger 都是「先 `SET NX EX` 占去重键，再查管理员、再投递」。
 * 一旦投递实际落空（用户没有该事件的偏好行 → dispatcher 静默丢弃），键照样被占满
 * 一个 TTL。Evaluator 复现的确定性竞态就是这么来的：
 *
 *   容器启动 → initial sync 命中护栏 → 占用 24h 键 → 通知因缺偏好被丢弃
 *   → 运维回填偏好 → 再次触发被 NX 键拦住 → 首个有效告警被吞最多 24 小时
 *
 * 而这个"可见化"正是 F-DSV4-03 的全部目的。
 *
 * 修复：保留 `SET NX` 抢占（并发风暴防护不能丢），但**投递数为 0 时把键删掉**，
 * 让下一次触发还能告警。等价于"去重窗口从第一次成功投递开始计时"。
 *
 * 同一形态的键原本有 4 处（BALANCE_LOW / CHANNEL_DOWN / AUTH_ALERT /
 * SYNC_RECONCILE_SKIPPED），全部收敛到这里，避免下次新增事件类型再踩一遍。
 *
 * @returns 实际投递成功的接收者数量；`null` 表示被去重窗口拦截、本次未尝试投递
 */
async function notifyDeduped(params: {
  dedupKey: string;
  ttlSeconds: number;
  /** 返回本次实际投递成功的接收者数量 */
  deliver: () => Promise<number>;
}): Promise<number | null> {
  const redis = getRedis();
  if (redis) {
    const claimed = await redis.set(params.dedupKey, "1", "EX", params.ttlSeconds, "NX");
    if (!claimed) return null; // 窗口内已经告警过
  }

  let delivered = 0;
  try {
    delivered = await params.deliver();
  } finally {
    // 一条都没送出去 → 释放键，别让这次空转吃掉整个窗口。
    // Redis 不可用时本就没占键，无需释放。
    if (redis && delivered === 0) {
      await redis.del(params.dedupKey).catch(() => {});
    }
  }
  return delivered;
}

/** 向全部管理员投递同一条通知，返回实际投递成功的人数 */
async function deliverToAdmins(
  eventType: Parameters<typeof sendNotification>[1],
  payload: Record<string, unknown>,
): Promise<number> {
  const adminIds = await getAdminUserIds();
  if (adminIds.length === 0) return 0;

  const results = await Promise.all(
    adminIds.map((adminId) =>
      sendNotification(adminId, eventType, payload).catch((err) => {
        console.error(`[triggers] ${eventType} to admin ${adminId} failed:`, err);
        return false;
      }),
    ),
  );
  return results.filter(Boolean).length;
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
    await notifyDeduped({
      dedupKey: `alert:balance_low:${userId}:${thresholdMicro}`,
      ttlSeconds: 86400,
      deliver: async () => {
        const sent = await sendNotification(
          userId,
          "BALANCE_LOW",
          { currentBalance: balance, threshold, projectId },
          projectId,
        ).catch((err) => {
          console.error("[triggers] BALANCE_LOW notification failed:", err);
          return false;
        });
        return sent ? 1 : 0;
      },
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
    await notifyDeduped({
      dedupKey: `alert:channel_down:${params.channelId}`,
      ttlSeconds: 21600, // 6 h
      deliver: () =>
        deliverToAdmins("CHANNEL_DOWN", {
          channelId: params.channelId,
          providerName: params.providerName,
          modelName: params.modelName,
          lastError: params.lastError ?? null,
        }),
    });
  } catch (err) {
    console.error("[triggers] sendChannelDownToAdmins error:", err);
  }
}

// ============================================================
// BL-BILLING-AUDIT-EXT-P1 F-BAX-05: AUTH_ALERT (24-hour dedup per channel)
// ============================================================

/**
 * 连续 N 次 auth_failed 触发；按决策 E 只落入 in-app，不发 email / webhook。
 * dedup 键按 channelId + 24h，防止长期故障 channel 重复刷告警。
 */
export async function sendAuthAlertToAdmins(params: {
  channelId: string;
  providerName: string;
  modelName: string;
  errorMessage: string | null;
  firstFailureAt: Date | string;
  consecutiveFailures: number;
}): Promise<void> {
  try {
    const firstFailureIso =
      typeof params.firstFailureAt === "string"
        ? params.firstFailureAt
        : params.firstFailureAt.toISOString();

    await notifyDeduped({
      dedupKey: `alert:auth_failed:${params.channelId}`,
      ttlSeconds: 86400, // 24 h
      deliver: () =>
        deliverToAdmins("AUTH_ALERT", {
          channelId: params.channelId,
          providerName: params.providerName,
          modelName: params.modelName,
          errorMessage: params.errorMessage,
          firstFailureAt: firstFailureIso,
          consecutiveFailures: params.consecutiveFailures,
        }),
    });
  } catch (err) {
    console.error("[triggers] sendAuthAlertToAdmins error:", err);
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

// ============================================================
// BL-DEEPSEEK-V4-HOTFIX F-DSV4-03: SYNC_RECONCILE_SKIPPED
// （24h dedup per provider + reason）
// ============================================================

/** 护栏命中的两种原因，进 dedup key 与 payload */
export type ReconcileSkipReason = "zero_models" | "shrink_guard";

/**
 * model-sync 的防误杀护栏拦下 reconcile 时调用。
 *
 * 事故背景：DeepSeek 直连下线 `deepseek-chat` / `deepseek-reasoner` 后远端模型
 * 数从 5 掉到 2，触发 `models.length < existingChannelCount * 0.5` 护栏 →
 * reconcile 被跳过 → 陈旧通道未被自动 DISABLED。护栏拦得对（防上游抖动误杀），
 * 但它**只 console.log**，连续 5 天没有任何人看得见，直到用户报障。
 *
 * 护栏命中恰恰意味着"自动化不敢动，需要人来看一眼"，因此必须推给管理员。
 * dedup 按 provider + reason 24h，避免每天 04:00 定时同步重复轰炸。
 */
export async function sendSyncReconcileSkippedToAdmins(params: {
  providerName: string;
  reason: ReconcileSkipReason;
  remoteModelCount: number;
  existingChannelCount: number;
}): Promise<void> {
  try {
    await notifyDeduped({
      dedupKey: `alert:sync_reconcile_skipped:${params.providerName}:${params.reason}`,
      ttlSeconds: 86400, // 24 h
      deliver: () =>
        deliverToAdmins("SYNC_RECONCILE_SKIPPED", {
          providerName: params.providerName,
          reason: params.reason,
          remoteModelCount: params.remoteModelCount,
          existingChannelCount: params.existingChannelCount,
        }),
    });
  } catch (err) {
    console.error("[triggers] sendSyncReconcileSkippedToAdmins error:", err);
  }
}
