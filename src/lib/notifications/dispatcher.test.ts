/**
 * F-UA-02: dispatcher unit tests.
 *
 * We mock @/lib/prisma and inject a stub fetch + short backoff so the
 * retry branches run in milliseconds. The goal is to pin the channel-
 * routing and retry-count contract — an actual end-to-end run against
 * a live server is out of scope here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type PrefRow = {
  channels: string[];
  enabled: boolean;
  webhookUrl: string | null;
  webhookSecret: string | null;
};

const prefState: { current: PrefRow | null } = { current: null };
const inAppCalls: unknown[] = [];
const webhookCalls: unknown[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationPreference: {
      findUnique: vi.fn(async () => prefState.current),
    },
    notification: {
      create: vi.fn(async ({ data }: { data: { channel: string } }) => {
        if (data.channel === "INAPP") inAppCalls.push(data);
        else webhookCalls.push(data);
        return data;
      }),
    },
  },
}));

// BL-SEC-POLISH F-SP-02: dispatcher now SSRF-gates the webhook URL. Tests use
// `https://example.invalid` which would fail DNS resolution — stub the guard
// to allow all URLs so the retry/success logic stays the real subject under
// test here. Dedicated url-safety tests live in src/lib/infra/__tests__/.
vi.mock("@/lib/infra/url-safety", () => ({
  isSafeWebhookUrl: vi.fn(async () => ({ safe: true })),
  sanitizeImageContentType: (raw: string | null | undefined) => raw ?? "application/octet-stream",
}));

import { sendNotification } from "./dispatcher";

beforeEach(() => {
  prefState.current = null;
  inAppCalls.length = 0;
  webhookCalls.length = 0;
});

describe("sendNotification (F-UA-02)", () => {
  it("is a no-op when no preference row exists", async () => {
    await sendNotification("user-1", "BALANCE_LOW", { balance: 0 });
    expect(inAppCalls).toHaveLength(0);
    expect(webhookCalls).toHaveLength(0);
  });

  it("is a no-op when the preference is disabled", async () => {
    prefState.current = {
      channels: ["inApp"],
      enabled: false,
      webhookUrl: null,
      webhookSecret: null,
    };
    await sendNotification("user-1", "BALANCE_LOW", { balance: 0 });
    expect(inAppCalls).toHaveLength(0);
  });

  it("writes an inApp row when inApp is enabled", async () => {
    prefState.current = {
      channels: ["inApp"],
      enabled: true,
      webhookUrl: null,
      webhookSecret: null,
    };
    await sendNotification("user-1", "BALANCE_LOW", { balance: 0.01 });
    expect(inAppCalls).toHaveLength(1);
    expect(webhookCalls).toHaveLength(0);
  });

  it("retries the webhook up to 3 times before writing FAILED", async () => {
    prefState.current = {
      channels: ["webhook"],
      enabled: true,
      webhookUrl: "https://example.invalid/hook",
      webhookSecret: "s3cret",
    };
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));

    await sendNotification("user-1", "BALANCE_LOW", { balance: 0.01 }, undefined, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: [1, 1, 1],
    });
    // Wait deterministically for the fire-and-forget webhook to settle.
    await vi.waitFor(() => expect(webhookCalls).toHaveLength(1), { timeout: 1000 });

    // 1 initial + 3 retries = 4 total attempts
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect((webhookCalls[0] as { status: string }).status).toBe("FAILED");
  });

  it("stops retrying once the webhook returns 2xx", async () => {
    prefState.current = {
      channels: ["webhook"],
      enabled: true,
      webhookUrl: "https://example.invalid/hook",
      webhookSecret: "s3cret",
    };
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 2) return new Response("nope", { status: 500 });
      return new Response("ok", { status: 200 });
    });

    await sendNotification("user-1", "BALANCE_LOW", { balance: 0.01 }, undefined, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: [1, 1, 1],
    });
    await vi.waitFor(() => expect(webhookCalls).toHaveLength(1), { timeout: 1000 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((webhookCalls[0] as { status: string }).status).toBe("SENT");
  });
});
