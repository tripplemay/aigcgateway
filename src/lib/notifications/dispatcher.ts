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
  fetchImpl: fetch,
  backoffMs: [5_000, 30_000, 120_000],
};

export async function sendNotification(
  userId: string,
  eventType: NotificationEventType,
  payload: DispatchPayload,
  projectId?: string,
  deps: DispatcherDeps = DEFAULT_DEPS,
): Promise<void> {
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId_eventType: { userId, eventType } },
  });

  // No preference row or explicitly disabled → swallow silently. The
  // spec chooses silence over an error because event sources should
  // never fail the caller's main request.
  if (!pref || !pref.enabled) return;

  const channels = (pref.channels as unknown as string[] | null) ?? [];

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
  }
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
