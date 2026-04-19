/**
 * BL-INFRA-ARCHIVE F-IA-01 — archive cleanup unit tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const healthDeleteMany = vi.fn();
const systemLogDeleteMany = vi.fn();
const notificationsDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    healthCheck: { deleteMany: (args: unknown) => healthDeleteMany(args) },
    systemLog: { deleteMany: (args: unknown) => systemLogDeleteMany(args) },
    notification: { deleteMany: (args: unknown) => notificationsDeleteMany(args) },
  },
}));

import {
  cleanupHealthChecks,
  cleanupSystemLogs,
  RETENTION_DAYS,
} from "../archive-cleanup";
import {
  startMaintenanceScheduler,
  stopMaintenanceScheduler,
  __maintenanceTickForTest,
} from "../scheduler";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  healthDeleteMany.mockReset();
  systemLogDeleteMany.mockReset();
  notificationsDeleteMany.mockReset();
  healthDeleteMany.mockResolvedValue({ count: 0 });
  systemLogDeleteMany.mockResolvedValue({ count: 0 });
  notificationsDeleteMany.mockResolvedValue({ count: 0 });
});

describe("cleanupHealthChecks (F-IA-01)", () => {
  it("deletes rows with createdAt < now - 30 days", async () => {
    healthDeleteMany.mockResolvedValueOnce({ count: 42 });
    const now = new Date("2026-04-20T12:00:00Z");
    const result = await cleanupHealthChecks(now);

    expect(result).toEqual({ deleted: 42 });
    const call = healthDeleteMany.mock.calls[0][0];
    const cutoff = call.where.createdAt.lt as Date;
    expect(cutoff.getTime()).toBe(now.getTime() - 30 * DAY_MS);
  });

  it("retention window matches RETENTION_DAYS.health_checks", () => {
    expect(RETENTION_DAYS.health_checks).toBe(30);
  });
});

describe("cleanupSystemLogs (F-IA-01)", () => {
  it("deletes rows with createdAt < now - 90 days", async () => {
    systemLogDeleteMany.mockResolvedValueOnce({ count: 7 });
    const now = new Date("2026-04-20T12:00:00Z");
    const result = await cleanupSystemLogs(now);

    expect(result).toEqual({ deleted: 7 });
    const call = systemLogDeleteMany.mock.calls[0][0];
    const cutoff = call.where.createdAt.lt as Date;
    expect(cutoff.getTime()).toBe(now.getTime() - 90 * DAY_MS);
  });

  it("retention window matches RETENTION_DAYS.system_logs", () => {
    expect(RETENTION_DAYS.system_logs).toBe(90);
  });
});

describe("maintenance scheduler (F-IA-01)", () => {
  it("a single tick fans out to all three cleanups", async () => {
    healthDeleteMany.mockResolvedValueOnce({ count: 1 });
    systemLogDeleteMany.mockResolvedValueOnce({ count: 2 });
    notificationsDeleteMany.mockResolvedValueOnce({ count: 3 });

    await __maintenanceTickForTest();

    expect(notificationsDeleteMany).toHaveBeenCalledTimes(1);
    expect(healthDeleteMany).toHaveBeenCalledTimes(1);
    expect(systemLogDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("one cleanup failure does not block the others", async () => {
    healthDeleteMany.mockRejectedValueOnce(new Error("db down"));
    systemLogDeleteMany.mockResolvedValueOnce({ count: 1 });
    notificationsDeleteMany.mockResolvedValueOnce({ count: 1 });

    await __maintenanceTickForTest();

    expect(systemLogDeleteMany).toHaveBeenCalledTimes(1);
    expect(notificationsDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("start invokes tick immediately; stop clears the interval", async () => {
    const stop = startMaintenanceScheduler();
    // Start calls `void tick()` synchronously — allow the microtask queue
    // to drain.
    await Promise.resolve();
    await Promise.resolve();
    expect(healthDeleteMany).toHaveBeenCalled();
    expect(typeof stop).toBe("function");
    stop();
    // Calling stop twice should be safe (idempotent).
    stopMaintenanceScheduler();
  });
});
