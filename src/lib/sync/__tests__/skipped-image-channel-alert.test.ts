/**
 * BL-IMG-GUANGTECH-CHANNEL F-GTI-02 — 跳过 IMAGE channel 的告警可见化回归。
 *
 * 事故：2026-07-03 的 sync 为 guangtech 建了 `guangtech/gpt-image-1` / `-1.5` /
 * `-2` 三行 models，却按 F-SI-01 的设计**没建 channel**（DB 触发器
 * `trg_validate_image_channel_pricing` 禁止 costPrice 全零的 IMAGE channel，
 * 而 sync 拿不到真实图片单价）。跳过本身是对的 —— 硬建会让整批 createMany 连坐
 * 失败、把同批 TEXT channel 一起拖下水 —— 但它**只把计数拼进 console.log**，
 * 全仓 grep `skippedImageChannels` 只命中 model-sync.ts 自身。三个图片模型因此
 * 静默不可用一个月，直到用户报障「guangtech 无法生图」。
 *
 * 与 reconcile-skip-alert.test.ts 钉的是同一条规律的第二次复发：
 * **自动化主动放弃处置 = 必须有人来看一眼。**
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, writeSystemLog, sendSyncImageChannelSkippedToAdmins } = vi.hoisted(() => ({
  mockPrisma: {},
  writeSystemLog: vi.fn(),
  sendSyncImageChannelSkippedToAdmins: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/system-logger", () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLog(...args),
}));
vi.mock("@/lib/notifications/triggers", () => ({
  sendSyncReconcileSkippedToAdmins: vi.fn(),
  sendSyncImageChannelSkippedToAdmins: (...args: unknown[]) =>
    sendSyncImageChannelSkippedToAdmins(...args),
}));

import { announceSkippedImageChannels } from "../model-sync";

const GUANGTECH_SET = [
  "guangtech/gpt-image-1 → guangtech/gpt-image-1",
  "guangtech/gpt-image-1.5 → guangtech/gpt-image-1.5",
  "guangtech/gpt-image-2 → guangtech/gpt-image-2",
];

beforeEach(() => {
  writeSystemLog.mockReset().mockResolvedValue(undefined);
  sendSyncImageChannelSkippedToAdmins.mockReset().mockResolvedValue(undefined);
});

describe("announceSkippedImageChannels — 有跳过项", () => {
  it("写 SystemLog(SYNC/WARN)，detail 含数量与完整模型清单", async () => {
    await announceSkippedImageChannels(GUANGTECH_SET);

    expect(writeSystemLog).toHaveBeenCalledTimes(1);
    const [category, level, message, detail] = writeSystemLog.mock.calls[0];
    expect(category).toBe("SYNC");
    expect(level).toBe("WARN");
    expect(message).toContain("3");
    expect(detail).toMatchObject({ count: 3, entries: GUANGTECH_SET });
  });

  it("同时推管理员通知，entries 原样透传", async () => {
    await announceSkippedImageChannels(GUANGTECH_SET);

    expect(sendSyncImageChannelSkippedToAdmins).toHaveBeenCalledTimes(1);
    expect(sendSyncImageChannelSkippedToAdmins).toHaveBeenCalledWith({ entries: GUANGTECH_SET });
  });
});

describe("announceSkippedImageChannels — 无跳过项", () => {
  it("既不写日志也不发通知（不制造噪音）", async () => {
    await announceSkippedImageChannels([]);

    expect(writeSystemLog).not.toHaveBeenCalled();
    expect(sendSyncImageChannelSkippedToAdmins).not.toHaveBeenCalled();
  });
});

describe("announceSkippedImageChannels — 告警链路自身失败不得带崩 sync", () => {
  it("SystemLog 写失败仍继续推通知，且不抛", async () => {
    writeSystemLog.mockRejectedValue(new Error("db down"));

    await expect(announceSkippedImageChannels(GUANGTECH_SET)).resolves.toBeUndefined();
    expect(sendSyncImageChannelSkippedToAdmins).toHaveBeenCalledTimes(1);
  });

  it("通知投递失败不抛", async () => {
    sendSyncImageChannelSkippedToAdmins.mockRejectedValue(new Error("redis down"));

    await expect(announceSkippedImageChannels(GUANGTECH_SET)).resolves.toBeUndefined();
    expect(writeSystemLog).toHaveBeenCalledTimes(1);
  });
});
