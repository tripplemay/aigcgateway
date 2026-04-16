/**
 * F-UA-03: triggers unit tests — BALANCE_LOW dedup logic.
 *
 * Mocks prisma + redis + dispatcher so the test runs in-process with no
 * external dependencies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── prisma mock ──────────────────────────────────────────────
const dbState = {
  userBalance: 5.0,
  alertThreshold: null as number | null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () =>
        dbState.userBalance !== undefined ? { balance: dbState.userBalance } : null,
      ),
    },
    project: {
      findUnique: vi.fn(async () =>
        dbState.alertThreshold !== null ? { alertThreshold: dbState.alertThreshold } : null,
      ),
    },
  },
}));

// ── redis mock ───────────────────────────────────────────────
// setResult: null → key already existed (NX miss); "OK" → key was set
let setResult: string | null = "OK";
const redisMock = {
  set: vi.fn(async () => setResult),
};

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => redisMock),
}));

// ── dispatcher mock ──────────────────────────────────────────
const sentNotifications: Array<{ userId: string; eventType: string; payload: unknown }> = [];

vi.mock("./dispatcher", () => ({
  sendNotification: vi.fn(async (userId: string, eventType: string, payload: unknown) => {
    sentNotifications.push({ userId, eventType, payload });
  }),
}));

import { checkAndSendBalanceLowAlert } from "./triggers";

describe("checkAndSendBalanceLowAlert (F-UA-03)", () => {
  beforeEach(() => {
    sentNotifications.length = 0;
    setResult = "OK";
    dbState.userBalance = 5.0;
    dbState.alertThreshold = null;
    vi.clearAllMocks();
    redisMock.set.mockImplementation(async () => setResult);
  });

  it("does nothing when project has no alertThreshold", async () => {
    dbState.alertThreshold = null;
    dbState.userBalance = 3.0;

    await checkAndSendBalanceLowAlert("user-1", "proj-1");

    expect(sentNotifications).toHaveLength(0);
  });

  it("does nothing when balance is above threshold", async () => {
    dbState.alertThreshold = 5.0;
    dbState.userBalance = 10.0;

    await checkAndSendBalanceLowAlert("user-1", "proj-1");

    expect(sentNotifications).toHaveLength(0);
  });

  it("fires BALANCE_LOW when balance drops below threshold (first time)", async () => {
    dbState.alertThreshold = 5.0;
    dbState.userBalance = 3.0;
    setResult = "OK"; // Redis NX succeeds → first notification

    await checkAndSendBalanceLowAlert("user-1", "proj-1");

    // Allow the fire-and-forget sendNotification to resolve
    await Promise.resolve();

    expect(sentNotifications).toHaveLength(1);
    expect(sentNotifications[0].eventType).toBe("BALANCE_LOW");
    expect(sentNotifications[0].userId).toBe("user-1");
    const p = sentNotifications[0].payload as Record<string, unknown>;
    expect(p.currentBalance).toBe(3.0);
    expect(p.threshold).toBe(5.0);
    expect(p.projectId).toBe("proj-1");
  });

  it("suppresses duplicate BALANCE_LOW within 24 h (Redis NX miss)", async () => {
    dbState.alertThreshold = 5.0;
    dbState.userBalance = 3.0;
    setResult = null; // Redis NX returns null → key already set → dedup hit

    await checkAndSendBalanceLowAlert("user-1", "proj-1");

    await Promise.resolve();

    expect(sentNotifications).toHaveLength(0);
  });

  it("sends when balance equals threshold (balance >= threshold guard uses >=)", async () => {
    dbState.alertThreshold = 5.0;
    dbState.userBalance = 5.0; // equal → NOT below → should NOT fire
    setResult = "OK";

    await checkAndSendBalanceLowAlert("user-1", "proj-1");

    await Promise.resolve();

    expect(sentNotifications).toHaveLength(0);
  });

  it("uses a dedup key scoped to userId + threshold microdollars", async () => {
    dbState.alertThreshold = 1.5;
    dbState.userBalance = 0.5;
    setResult = "OK";

    await checkAndSendBalanceLowAlert("user-abc", "proj-xyz");

    await Promise.resolve();

    // Threshold 1.5 → 1_500_000 microdollars
    expect(redisMock.set).toHaveBeenCalledWith(
      "alert:balance_low:user-abc:1500000",
      "1",
      "EX",
      86400,
      "NX",
    );
  });
});
