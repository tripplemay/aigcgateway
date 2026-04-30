import { describe, it, expect, vi, beforeEach } from "vitest";

const startScheduler = vi.fn();
const startBillingScheduler = vi.fn();
const startModelSyncScheduler = vi.fn();
const startMaintenanceScheduler = vi.fn(() => vi.fn());
const cleanupOldRecords = vi.fn().mockResolvedValue(0);
const acquireLeaderLock = vi.fn();

vi.mock("@/lib/env", () => ({
  assertImageProxySecret: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $connect: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/redis", () => ({
  waitForRedisReady: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/infra/leader-lock", () => ({
  acquireLeaderLock: (...args: unknown[]) => acquireLeaderLock(...args),
  releaseLeaderLock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/health/scheduler", () => ({
  startScheduler: (...args: unknown[]) => startScheduler(...args),
  cleanupOldRecords: (...args: unknown[]) => cleanupOldRecords(...args),
}));

vi.mock("@/lib/billing/scheduler", () => ({
  startBillingScheduler: (...args: unknown[]) => startBillingScheduler(...args),
}));

vi.mock("@/lib/sync/scheduler", () => ({
  startModelSyncScheduler: (...args: unknown[]) => startModelSyncScheduler(...args),
}));

vi.mock("@/lib/maintenance/scheduler", () => ({
  startMaintenanceScheduler: (...args: unknown[]) => startMaintenanceScheduler(...args),
}));

describe("BL-INFRA-ARCHIVE #4 leader-lock mock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acquireLeaderLock.mockResolvedValue(false);
    process.env.NEXT_RUNTIME = "nodejs";
  });

  it("does not start maintenance scheduler when leader lock is not acquired", async () => {
    const { register } = await import("../../src/instrumentation");
    await register();
    expect(acquireLeaderLock).toHaveBeenCalledTimes(1);
    expect(startMaintenanceScheduler).not.toHaveBeenCalled();
    expect(startScheduler).not.toHaveBeenCalled();
    expect(startBillingScheduler).not.toHaveBeenCalled();
    expect(startModelSyncScheduler).not.toHaveBeenCalled();
  });
});

