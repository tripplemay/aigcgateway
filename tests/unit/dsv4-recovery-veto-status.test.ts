/**
 * BL-DEEPSEEK-V4-HOTFIX fix round 3 evaluator regression.
 *
 * The new catalog veto is scoped to DISABLED -> ACTIVE recovery. A DEGRADED
 * text channel receives a model-specific full probe, so a PASS is stronger
 * availability evidence than an incomplete provider catalog.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  fetchModels,
  getSyncAdapter,
  runHealthCheck,
  runApiReachabilityCheck,
  writeSystemLog,
  sendAlert,
} = vi.hoisted(() => ({
  mockPrisma: {
    channel: { findUnique: vi.fn(), update: vi.fn() },
    aliasModelLink: { count: vi.fn() },
    healthCheck: { createMany: vi.fn() },
    provider: { findUnique: vi.fn() },
  },
  fetchModels: vi.fn(),
  getSyncAdapter: vi.fn(),
  runHealthCheck: vi.fn(),
  runApiReachabilityCheck: vi.fn(),
  writeSystemLog: vi.fn(),
  sendAlert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/system-logger", () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLog(...args),
}));
vi.mock("@/lib/health/checker", () => ({
  runHealthCheck: (...args: unknown[]) => runHealthCheck(...args),
  runApiReachabilityCheck: (...args: unknown[]) => runApiReachabilityCheck(...args),
  runCallProbe: vi.fn(),
}));
vi.mock("@/lib/health/alert", () => ({
  sendAlert: (...args: unknown[]) => sendAlert(...args),
}));
vi.mock("@/lib/notifications/triggers", () => ({
  sendChannelDownToAdmins: vi.fn(),
  sendChannelRecoveredToAdmins: vi.fn(),
  sendAuthAlertToAdmins: vi.fn(),
}));
vi.mock("@/lib/engine/cooldown", () => ({
  isTransientFailureReason: vi.fn().mockReturnValue(false),
  markChannelCooldown: vi.fn(),
}));
vi.mock("@/lib/sync/model-sync", () => ({
  getSyncAdapter: (...args: unknown[]) => getSyncAdapter(...args),
}));

import { checkChannel } from "@/lib/health/scheduler";

beforeEach(() => {
  fetchModels.mockReset().mockResolvedValue([
    { modelId: "deepseek-v4-flash" },
    { modelId: "deepseek-v4-pro" },
  ]);
  getSyncAdapter.mockReset().mockReturnValue({ fetchModels });
  mockPrisma.provider.findUnique.mockReset().mockResolvedValue({ id: "provider-1", config: {} });
  mockPrisma.channel.findUnique.mockReset().mockResolvedValue({
    id: "channel-1",
    realModelId: "catalog-omitted-but-callable",
    status: "DEGRADED",
    provider: { id: "provider-1", name: "deepseek", config: { quirks: null } },
    model: { id: "model-1", name: "catalog-omitted-but-callable", modality: "TEXT" },
  });
  mockPrisma.aliasModelLink.count.mockReset().mockResolvedValue(1);
  mockPrisma.healthCheck.createMany.mockReset().mockResolvedValue({ count: 1 });
  mockPrisma.channel.update.mockReset().mockResolvedValue({});
  runHealthCheck.mockReset().mockResolvedValue([
    {
      level: "CONNECTIVITY",
      result: "PASS",
      latencyMs: 1,
      errorMessage: null,
      responseBody: "ok",
    },
  ]);
  runApiReachabilityCheck.mockReset();
  writeSystemLog.mockReset().mockResolvedValue(undefined);
  sendAlert.mockReset().mockResolvedValue(undefined);
});

describe("DSV4 recovery veto status boundary", () => {
  it("does not veto a DEGRADED channel after its model-specific probe passes", async () => {
    await expect(checkChannel("channel-1")).resolves.toMatchObject([{ result: "PASS" }]);

    expect(runHealthCheck).toHaveBeenCalledOnce();
    expect(runApiReachabilityCheck).not.toHaveBeenCalled();
    expect(mockPrisma.channel.update).toHaveBeenCalledWith({
      where: { id: "channel-1" },
      data: { status: "ACTIVE" },
    });
  });
});
