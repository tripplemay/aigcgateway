/**
 * BL-DEEPSEEK-V4-HOTFIX fix_round 4 / DSV4-DEF-04 — 目录闸门的适用边界。
 *
 * fix_round 3 把闸门挂在 `status !== "ACTIVE"` 上，越界圈进了 DEGRADED：
 * DEGRADED 文本通道跑的是**模型特定的 full probe**，PASS 说明这个模型真的能调，
 * 却仍被一份不完整的 /models 目录否决，永久卡在 DEGRADED。
 *
 * 正确判据是「刚过的这次检查有没有真的碰到模型」：
 *   DISABLED + reachability（模型盲）→ 目录缺席是仅有的证据 → 否决
 *   DEGRADED  + full probe（真跑通）  → 实跑证据强于目录 → 放行
 *
 * Evaluator 的 `tests/unit/dsv4-recovery-veto-status.test.ts` 钉住了放行那半边；
 * 本文件钉住否决那半边，避免下次"修放行"时把闸门整个废掉。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  writeSystemLog: (...a: unknown[]) => writeSystemLog(...a),
}));
vi.mock("@/lib/health/checker", () => ({
  runHealthCheck: (...a: unknown[]) => runHealthCheck(...a),
  runApiReachabilityCheck: (...a: unknown[]) => runApiReachabilityCheck(...a),
  runCallProbe: vi.fn(),
}));
vi.mock("@/lib/health/alert", () => ({ sendAlert: (...a: unknown[]) => sendAlert(...a) }));
vi.mock("@/lib/notifications/triggers", () => ({
  // 这些在 updateChannelStatus 里被 `.catch()` 链式调用，必须返回 Promise
  sendChannelDownToAdmins: vi.fn().mockResolvedValue(undefined),
  sendChannelRecoveredToAdmins: vi.fn().mockResolvedValue(undefined),
  sendAuthAlertToAdmins: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/engine/cooldown", () => ({
  isTransientFailureReason: vi.fn().mockReturnValue(false),
  markChannelCooldown: vi.fn(),
}));
vi.mock("@/lib/sync/model-sync", () => ({
  getSyncAdapter: (...a: unknown[]) => getSyncAdapter(...a),
}));

import { checkChannel } from "@/lib/health/scheduler";

const PASS = [
  {
    level: "API_REACHABILITY",
    result: "PASS",
    latencyMs: 1,
    errorMessage: null,
    responseBody: "ok",
  },
];

beforeEach(() => {
  // 上游目录里没有这条通道的 realModelId —— 正是 DeepSeek 事故的形状
  fetchModels
    .mockReset()
    .mockResolvedValue([{ modelId: "deepseek-v4-flash" }, { modelId: "deepseek-v4-pro" }]);
  getSyncAdapter.mockReset().mockReturnValue({ fetchModels });
  mockPrisma.provider.findUnique.mockReset().mockResolvedValue({ id: "provider-1", config: {} });
  mockPrisma.aliasModelLink.count.mockReset().mockResolvedValue(1);
  mockPrisma.healthCheck.createMany.mockReset().mockResolvedValue({ count: 1 });
  mockPrisma.channel.update.mockReset().mockResolvedValue({});
  runHealthCheck.mockReset().mockResolvedValue(PASS);
  runApiReachabilityCheck.mockReset().mockResolvedValue(PASS);
  writeSystemLog.mockReset().mockResolvedValue(undefined);
  sendAlert.mockReset().mockResolvedValue(undefined);
});

/** IMAGE 模态 → planChannelCheck 走 reachability（模型盲），与 DISABLED 组合即闸门场景 */
function disabledReachabilityChannel() {
  mockPrisma.channel.findUnique.mockResolvedValue({
    id: "channel-stale",
    realModelId: "deepseek-chat",
    status: "DISABLED",
    provider: { id: "provider-1", name: "deepseek", config: { quirks: null } },
    model: { id: "model-1", name: "deepseek-v3", modality: "IMAGE" },
  });
}

describe("DISABLED + 模型盲 reachability → 闸门必须仍然否决", () => {
  it("陈旧 realModelId 不因 reachability PASS 而复活", async () => {
    disabledReachabilityChannel();

    await checkChannel("channel-stale");

    expect(runApiReachabilityCheck).toHaveBeenCalled();
    expect(mockPrisma.channel.update).not.toHaveBeenCalledWith({
      where: { id: "channel-stale" },
      data: { status: "ACTIVE" },
    });
  });

  it("否决写 SystemLog(AUTO_RECOVERY/WARN)，不做静默行为", async () => {
    disabledReachabilityChannel();

    await checkChannel("channel-stale");

    const warn = writeSystemLog.mock.calls.find((c) => c[0] === "AUTO_RECOVERY" && c[1] === "WARN");
    expect(warn, "应写入一条拒绝恢复的 WARN").toBeDefined();
    expect(String(warn![2])).toContain("deepseek-chat");
  });

  it("模型仍在目录中时正常恢复（闸门不是一刀切）", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "channel-live",
      realModelId: "deepseek-v4-flash",
      status: "DISABLED",
      provider: { id: "provider-1", name: "deepseek", config: { quirks: null } },
      model: { id: "model-2", name: "deepseek-v4-flash", modality: "IMAGE" },
    });

    await checkChannel("channel-live");

    expect(mockPrisma.channel.update).toHaveBeenCalledWith({
      where: { id: "channel-live" },
      data: { status: "ACTIVE" },
    });
  });
});
