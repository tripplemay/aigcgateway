/**
 * BL-DEEPSEEK-V4-HOTFIX F-DSV4-03 — 通知偏好覆盖度回归。
 *
 * 事故背景：`dispatcher.sendNotification` 对「用户没有该 eventType 的偏好行」
 * 是**静默丢弃**。偏好行只在建号时 seed、从无回填路径，于是生产 5 个 ADMIN
 * 账号（建号早于通知功能）一条偏好行都没有，notifications 表 0 行；而
 * `AUTH_ALERT` 更是进了 Prisma enum 和 trigger 却没进 seed 名单 —— 从上线起
 * 就是死信。本次新增的 SYNC_RECONCILE_SKIPPED 若不进名单会重蹈覆辙。
 *
 * 这条测试把「Prisma enum 里的每个事件类型都必须出现在 seed 名单里」变成
 * 结构性约束：以后任何人加新事件类型，忘了 seed 就会红。
 */
import { describe, it, expect } from "vitest";
import { NotificationEventType } from "@prisma/client";
import { defaultNotificationPreferences } from "./defaults";

const ALL_EVENT_TYPES = Object.values(NotificationEventType);

describe("默认偏好必须覆盖全部 NotificationEventType", () => {
  it("ADMIN 角色不漏任何事件类型（漏 = 该类通知永久静默丢弃）", () => {
    const seeded = defaultNotificationPreferences("ADMIN").map((s) => s.eventType);
    expect([...seeded].sort()).toEqual([...ALL_EVENT_TYPES].sort());
  });

  it("DEVELOPER 角色不漏任何事件类型", () => {
    const seeded = defaultNotificationPreferences("DEVELOPER").map((s) => s.eventType);
    expect([...seeded].sort()).toEqual([...ALL_EVENT_TYPES].sort());
  });

  it("同一角色内不得出现重复 eventType（createMany 会撞唯一键）", () => {
    for (const role of ["ADMIN", "DEVELOPER"] as const) {
      const seeded = defaultNotificationPreferences(role).map((s) => s.eventType);
      expect(new Set(seeded).size).toBe(seeded.length);
    }
  });
});

describe("运维类事件的默认开关", () => {
  it("ADMIN 默认开启 SYNC_RECONCILE_SKIPPED 与 AUTH_ALERT —— 否则本次修复等于没做", () => {
    const admin = defaultNotificationPreferences("ADMIN");
    for (const et of ["SYNC_RECONCILE_SKIPPED", "AUTH_ALERT"] as const) {
      const row = admin.find((s) => s.eventType === et);
      expect(row, `${et} 缺失`).toBeDefined();
      expect(row!.enabled, `${et} 对 ADMIN 应默认开启`).toBe(true);
      expect(row!.channels).toContain("inApp");
    }
  });

  it("DEVELOPER 侧运维类事件默认关闭（开发者无法处置服务商健康问题）", () => {
    const dev = defaultNotificationPreferences("DEVELOPER");
    for (const et of [
      "SYNC_RECONCILE_SKIPPED",
      "AUTH_ALERT",
      "CHANNEL_DOWN",
      "CHANNEL_RECOVERED",
      "PENDING_CLASSIFICATION",
    ] as const) {
      expect(dev.find((s) => s.eventType === et)!.enabled, `${et} 对 DEVELOPER 应默认关闭`).toBe(
        false,
      );
    }
  });
});
