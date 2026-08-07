/**
 * BL-IMG-GUANGTECH-CHANNEL F-GTI-02 fix_round 1 — GTI-DEF-04 回归。
 *
 * ## 被钉住的东西
 *
 * 存量用户的偏好回填现在由数据迁移
 * `prisma/migrations/20260807_backfill_notification_preferences` 自动完成
 * （部署跑 `prisma migrate deploy` 即执行，人想忘也忘不掉）。但 SQL 里的
 * 「哪些事件对哪个角色默认开」是 `defaults.ts` 的**第二份副本**，副本就会漂。
 *
 * 迁移 SQL 编码的规则是：
 *     ADMIN     → 全部 true
 *     DEVELOPER → 仅 BALANCE_LOW / SPENDING_RATE_EXCEEDED 为 true，其余 false
 *     channels  → 一律 ["inApp"]
 *
 * 这些用例直接断言 `defaults.ts` **仍然遵守同一条规则**。将来谁加了一个
 * 「DEVELOPER 也要默认开」的新事件类型，这里会红 —— 提醒他迁移 SQL 的
 * CASE 分支也得跟着改，否则存量用户会被按错误的默认值回填。
 *
 * 为什么不去解析 SQL 文本：那样测的是字符串而不是语义，改个换行就假红。
 * 断言不变量本身更稳，也更能说明意图。
 */
import { describe, it, expect } from "vitest";
import { NotificationEventType } from "@prisma/client";
import { defaultNotificationPreferences } from "./defaults";

/** 与迁移 SQL 的 CASE 分支一一对应 */
const DEVELOPER_ENABLED_IN_MIGRATION = new Set<string>([
  "BALANCE_LOW",
  "SPENDING_RATE_EXCEEDED",
]);

describe("GTI-DEF-04 — 回填迁移的默认值必须与 defaults.ts 一致", () => {
  it("ADMIN：迁移一律 enabled=true，defaults.ts 不得有例外", () => {
    const admin = defaultNotificationPreferences("ADMIN");
    for (const et of Object.values(NotificationEventType)) {
      const row = admin.find((s) => s.eventType === et);
      expect(row, `${et} 未出现在 ADMIN 默认名单`).toBeDefined();
      expect(
        row!.enabled,
        `${et} 对 ADMIN 是 false，但回填迁移会写 true —— 两者已漂移，须同步修改 ` +
          `prisma/migrations/20260807_backfill_notification_preferences/migration.sql`,
      ).toBe(true);
    }
  });

  it("DEVELOPER：仅 BALANCE_LOW / SPENDING_RATE_EXCEEDED 默认开", () => {
    const dev = defaultNotificationPreferences("DEVELOPER");
    for (const et of Object.values(NotificationEventType)) {
      const row = dev.find((s) => s.eventType === et);
      expect(row, `${et} 未出现在 DEVELOPER 默认名单`).toBeDefined();
      expect(
        row!.enabled,
        `${et} 的 DEVELOPER 默认值与回填迁移的 CASE 分支不一致 —— ` +
          `迁移只对 ${[...DEVELOPER_ENABLED_IN_MIGRATION].join(" / ")} 写 true`,
      ).toBe(DEVELOPER_ENABLED_IN_MIGRATION.has(et));
    }
  });

  it("两个角色的 channels 一律为 ['inApp']（迁移硬编码该值）", () => {
    for (const role of ["ADMIN", "DEVELOPER"] as const) {
      for (const seed of defaultNotificationPreferences(role)) {
        expect(seed.channels, `${role}/${seed.eventType} 的 channels 与迁移不一致`).toEqual([
          "inApp",
        ]);
      }
    }
  });

  it("本批次新增的 SYNC_IMAGE_CHANNEL_SKIPPED 确实在 enum 里（迁移遍历 enum_range）", () => {
    // 迁移不硬编码类型名单，而是 CROSS JOIN enum_range —— 只要类型进了 enum
    // 就会被回填。这条用例守住「类型真的加进去了」这个前提。
    expect(Object.values(NotificationEventType)).toContain("SYNC_IMAGE_CHANNEL_SKIPPED");
  });
});
