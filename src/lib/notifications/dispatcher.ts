/**
 * F-UA-02: Notification dispatcher.
 *
 * sendNotification(userId, eventType, payload) resolves the user's
 * NotificationPreference row, fans out to every enabled channel, and
 * persists Notification rows. inApp channels are a direct insert;
 * webhook channels POST asynchronously with HMAC-SHA256 signing and
 * exponential-backoff retries (5s / 30s / 120s). Retry failures are
 * persisted as Notification rows with status=FAILED + an error field
 * so operators can triage from admin/logs.
 *
 * The dispatcher is fire-and-forget from the caller's perspective:
 * sendNotification returns once the synchronous inApp row is written,
 * the webhook retry loop runs in the background and never blocks the
 * originating request.
 */
import { prisma } from "@/lib/prisma";
import type { NotificationEventType, NotificationStatus, Prisma } from "@prisma/client";
import { createHmac } from "node:crypto";
import { defaultExpiresAt } from "./ttl";
import { fetchWithTimeout } from "@/lib/infra/fetch-with-timeout";
import { isSafeWebhookUrl } from "@/lib/infra/url-safety";

const WEBHOOK_TIMEOUT_MS = 10_000;

// Default fetch wrapper: every outbound webhook carries a 10s deadline so a
// hanging receiver cannot pin our dispatcher thread indefinitely.
const timeoutFetch: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  fetchWithTimeout(String(input), {
    ...(init ?? {}),
    timeoutMs: WEBHOOK_TIMEOUT_MS,
  })) as typeof fetch;

export interface DispatchPayload {
  // Arbitrary JSON-serialisable body. Callers use their own shape per
  // event type (e.g. BALANCE_LOW carries {currentBalance, threshold}).
  [key: string]: unknown;
}

// Exported for unit tests — allows overriding fetch + retry timings
// without touching env or global state.
export interface DispatcherDeps {
  fetchImpl: typeof fetch;
  backoffMs: number[];
}

const DEFAULT_DEPS: DispatcherDeps = {
  fetchImpl: timeoutFetch,
  backoffMs: [5_000, 30_000, 120_000],
};

/**
 * 返回值语义（BL-DEEPSEEK-V4-HOTFIX fix_round 1 / DSV4-DEF-01）：
 * `true` 表示这条通知**真的进入了投递路径**（写了 inApp 行，或派发了 webhook）。
 * `false` 表示被静默丢弃 —— 用户没有该事件的偏好行，或显式关掉了。
 *
 * 调用方（triggers.ts）据此决定要不要提交 Redis 去重窗口：把一条根本没送出去
 * 的通知也算进去重，会让回填偏好后的第一条有效告警被白白吞掉一个 TTL。
 */
export async function sendNotification(
  userId: string,
  eventType: NotificationEventType,
  payload: DispatchPayload,
  projectId?: string,
  deps: DispatcherDeps = DEFAULT_DEPS,
): Promise<boolean> {
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId_eventType: { userId, eventType } },
  });

  // No preference row or explicitly disabled → swallow silently. The
  // spec chooses silence over an error because event sources should
  // never fail the caller's main request.
  if (!pref || !pref.enabled) return false;

  const channels = (pref.channels as unknown as string[] | null) ?? [];
  let delivered = false;

  // ── inApp channel: synchronous DB insert ──
  if (channels.includes("inApp")) {
    await prisma.notification
      .create({
        data: {
          userId,
          projectId: projectId ?? null,
          eventType,
          channel: "INAPP",
          status: "SENT",
          payload: payload as unknown as Prisma.InputJsonValue,
          expiresAt: defaultExpiresAt(eventType),
        },
      })
      .then(() => {
        delivered = true;
      })
      .catch((err) => {
        console.error("[dispatcher] inApp insert failed:", err);
      });
  }

  // ── webhook channel: fire-and-forget retry loop ──
  if (channels.includes("webhook") && pref.webhookUrl) {
    void dispatchWebhook(
      {
        userId,
        projectId,
        eventType,
        payload,
        url: pref.webhookUrl,
        secret: pref.webhookSecret ?? "",
      },
      deps,
    );
    // webhook 是 fire-and-forget（重试循环在后台），派发出去即视为已投递 ——
    // 这里判定的是"有没有送出去"，不是"对端有没有收到"。
    delivered = true;
  }

  return delivered;
}

interface WebhookJob {
  userId: string;
  projectId?: string;
  eventType: NotificationEventType;
  payload: DispatchPayload;
  url: string;
  secret: string;
}

async function dispatchWebhook(job: WebhookJob, deps: DispatcherDeps): Promise<void> {
  // BL-SEC-POLISH F-SP-02: SSRF guard. A user-supplied webhook URL must not
  // resolve to private / metadata ranges. Fail silent here (fire-and-forget
  // contract) but persist an audit log so operators can see the block.
  const safety = await isSafeWebhookUrl(job.url);
  if (!safety.safe) {
    try {
      await prisma.notification.create({
        data: {
          userId: job.userId,
          projectId: job.projectId ?? null,
          eventType: job.eventType,
          channel: "WEBHOOK",
          status: "FAILED",
          payload: job.payload as unknown as Prisma.InputJsonValue,
          error: `webhook URL blocked by SSRF guard: ${safety.reason}`,
          expiresAt: defaultExpiresAt(job.eventType),
        },
      });
    } catch (err) {
      console.error("[dispatcher] ssrf block log failed:", err);
    }
    return;
  }

  const body = JSON.stringify({
    event: job.eventType,
    payload: job.payload,
    timestamp: new Date().toISOString(),
  });
  const signature = job.secret ? createHmac("sha256", job.secret).update(body).digest("hex") : "";

  let attempt = 0;
  let lastError: string | null = null;
  let status: NotificationStatus = "FAILED";

  while (attempt <= deps.backoffMs.length) {
    try {
      const res = await deps.fetchImpl(job.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AIGC-Signature": signature,
          "X-AIGC-Event": job.eventType,
        },
        body,
      });
      if (res.ok) {
        status = "SENT";
        lastError = null;
        break;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = (err as Error).message;
    }

    // Exhausted retries? Persist FAILED and stop.
    if (attempt >= deps.backoffMs.length) break;
    await new Promise((resolve) => setTimeout(resolve, deps.backoffMs[attempt]));
    attempt += 1;
  }

  try {
    await prisma.notification.create({
      data: {
        userId: job.userId,
        projectId: job.projectId ?? null,
        eventType: job.eventType,
        channel: "WEBHOOK",
        status,
        payload: job.payload as unknown as Prisma.InputJsonValue,
        error: lastError ?? null,
        expiresAt: defaultExpiresAt(job.eventType),
      },
    });
  } catch (err) {
    console.error("[dispatcher] failed to persist webhook result:", err);
  }
}
