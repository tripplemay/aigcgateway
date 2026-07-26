/**
 * BL-DEEPSEEK-V4-HOTFIX F-DSV4-03 — 护栏命中的告警可见化回归。
 *
 * 事故：DeepSeek 直连下线 deepseek-chat / deepseek-reasoner 后，远端模型数
 * 5 → 2 触发 `models.length < existingChannelCount * 0.5` 缩水护栏，reconcile
 * 被跳过、陈旧通道未自动下架。护栏拦得对，但它**只 console.log** —— 2026-07-21
 * 起连续 5 天同一行日志，无 SystemLog、无通知，直到用户报障才被发现。
 *
 * 这些用例钉住：护栏命中必须同时写 SystemLog(SYNC/WARN) 和管理员通知，
 * 且告警链路自身的失败不能把整轮 sync 带崩。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, writeSystemLog, sendSyncReconcileSkippedToAdmins } = vi.hoisted(() => ({
  mockPrisma: {},
  writeSystemLog: vi.fn(),
  sendSyncReconcileSkippedToAdmins: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/system-logger", () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLog(...args),
}));
vi.mock("@/lib/notifications/triggers", () => ({
  sendSyncReconcileSkippedToAdmins: (...args: unknown[]) =>
    sendSyncReconcileSkippedToAdmins(...args),
}));

import { announceReconcileSkipped } from "../model-sync";

beforeEach(() => {
  writeSystemLog.mockReset().mockResolvedValue(undefined);
  sendSyncReconcileSkippedToAdmins.mockReset().mockResolvedValue(undefined);
});

describe("announceReconcileSkipped — shrink_guard（本次事故分支）", () => {
  const params = {
    providerName: "deepseek",
    reason: "shrink_guard" as const,
    remoteModelCount: 2,
    existingChannelCount: 5,
  };

  it("写 SystemLog(SYNC/WARN)，detail 含 provider / 远端模型数 / 现存通道数", async () => {
    await announceReconcileSkipped(params);

    expect(writeSystemLog).toHaveBeenCalledTimes(1);
    const [category, level, message, detail] = writeSystemLog.mock.calls[0];
    expect(category).toBe("SYNC");
    expect(level).toBe("WARN");
    expect(message).toContain("deepseek");
    expect(detail).toMatchObject({
      provider: "deepseek",
      reason: "shrink_guard",
      remoteModelCount: 2,
      existingChannelCount: 5,
    });
  });

  it("同时推管理员通知，参数原样透传", async () => {
    await announceReconcileSkipped(params);

    expect(sendSyncReconcileSkippedToAdmins).toHaveBeenCalledTimes(1);
    expect(sendSyncReconcileSkippedToAdmins.mock.calls[0][0]).toEqual(params);
  });

  it("文案点明「需人工确认」，避免运维把它当噪声划过", async () => {
    await announceReconcileSkipped(params);
    expect(String(writeSystemLog.mock.calls[0][2])).toMatch(/人工确认/);
  });
});

describe("announceReconcileSkipped — zero_models 分支", () => {
  it("上游返回 0 模型时同样告警，reason 为 zero_models", async () => {
    await announceReconcileSkipped({
      providerName: "xiaomi-mimo",
      reason: "zero_models",
      remoteModelCount: 0,
      existingChannelCount: 2,
    });

    expect(writeSystemLog.mock.calls[0][3]).toMatchObject({ reason: "zero_models" });
    expect(sendSyncReconcileSkippedToAdmins.mock.calls[0][0]).toMatchObject({
      reason: "zero_models",
    });
  });
});

describe("announceReconcileSkipped — 告警失败不拖垮 sync", () => {
  it("SystemLog 写失败仍继续推通知，且不抛出", async () => {
    writeSystemLog.mockRejectedValue(new Error("db down"));

    await expect(
      announceReconcileSkipped({
        providerName: "deepseek",
        reason: "shrink_guard",
        remoteModelCount: 2,
        existingChannelCount: 5,
      }),
    ).resolves.toBeUndefined();

    expect(sendSyncReconcileSkippedToAdmins).toHaveBeenCalledTimes(1);
  });

  it("通知推送失败也不抛出", async () => {
    sendSyncReconcileSkippedToAdmins.mockRejectedValue(new Error("redis down"));

    await expect(
      announceReconcileSkipped({
        providerName: "deepseek",
        reason: "shrink_guard",
        remoteModelCount: 2,
        existingChannelCount: 5,
      }),
    ).resolves.toBeUndefined();
  });
});
