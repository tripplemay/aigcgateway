/**
 * BL-DEEPSEEK-V4-HOTFIX F-DSV4-03 — 回填缺失的 NotificationPreference 行。
 *
 * ## 为什么需要
 *
 * `dispatcher.sendNotification` 对「用户没有该 eventType 的偏好行」是**静默丢弃**
 * （dispatcher.ts:`if (!pref || !pref.enabled) return;`）。偏好行只在建号时由
 * `seedDefaultNotificationPreferences` 写入，从没有过回填路径，于是：
 *
 * - 生产 5 个 ADMIN 账号（建号早于通知功能）**一条偏好行都没有** →
 *   CHANNEL_DOWN / CHANNEL_RECOVERED / PENDING_CLASSIFICATION 从上线起
 *   就没送达过任何管理员（notifications 表 0 行可证）。
 * - `AUTH_ALERT`（BL-BILLING-AUDIT-EXT-P1 F-BAX-05）进了 Prisma enum 和 trigger，
 *   却没进 seed 名单 → 对所有人都是死信。
 *
 * 本次新增的 `SYNC_RECONCILE_SKIPPED` 若不回填，会掉进同一个坑。
 *
 * ## 行为
 *
 * 按用户角色取 `defaultNotificationPreferences(role)`，只补**缺失**的
 * (userId, eventType) 组合；已存在的行一律不动（不覆盖用户已调过的开关）。
 *
 * 用法：
 *   npx tsx scripts/backfill-notification-preferences.ts            # dry-run（默认）
 *   npx tsx scripts/backfill-notification-preferences.ts --apply    # 写库
 *
 * 幂等：重跑输出 0 新增。
 * 回滚：删除本次新建的偏好行即可（纯数据操作，无 schema 变更）。
 */

import { PrismaClient, type NotificationEventType } from "@prisma/client";
import { defaultNotificationPreferences } from "../src/lib/notifications/defaults";

export interface BackfillPlanRow {
  userId: string;
  email: string;
  role: string;
  missing: Array<{ eventType: NotificationEventType; enabled: boolean; channels: string[] }>;
}

export interface BackfillResult {
  totalUsers: number;
  plan: BackfillPlanRow[];
  totalMissing: number;
  applied: boolean;
  created: number;
}

export async function planBackfill(prisma: PrismaClient): Promise<BackfillPlanRow[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      notificationPrefs: { select: { eventType: true } },
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  const plan: BackfillPlanRow[] = [];
  for (const u of users) {
    const existing = new Set(u.notificationPrefs.map((p) => p.eventType));
    const missing = defaultNotificationPreferences(u.role)
      .filter((seed) => !existing.has(seed.eventType))
      .map((seed) => ({
        eventType: seed.eventType,
        enabled: seed.enabled,
        channels: seed.channels,
      }));
    if (missing.length > 0) {
      plan.push({ userId: u.id, email: u.email, role: u.role, missing });
    }
  }
  return plan;
}

export async function backfillNotificationPreferences(
  prisma: PrismaClient,
  apply: boolean,
): Promise<BackfillResult> {
  const totalUsers = await prisma.user.count();
  const plan = await planBackfill(prisma);
  const totalMissing = plan.reduce((n, r) => n + r.missing.length, 0);

  let created = 0;
  if (apply && totalMissing > 0) {
    const res = await prisma.notificationPreference.createMany({
      data: plan.flatMap((r) =>
        r.missing.map((m) => ({
          userId: r.userId,
          eventType: m.eventType,
          channels: m.channels as unknown as object,
          enabled: m.enabled,
        })),
      ),
      // 并发建号时的兜底；planBackfill 已排除已存在项
      skipDuplicates: true,
    });
    created = res.count;
  }

  return { totalUsers, plan, totalMissing, applied: apply, created };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply") || process.env.APPLY === "1";
  const prisma = new PrismaClient();

  try {
    console.log("=== BL-DEEPSEEK-V4-HOTFIX F-DSV4-03 — NotificationPreference 回填 ===");
    console.log(`模式：${apply ? "APPLY（写库）" : "DRY-RUN（只盘点，不写库）"}\n`);

    const result = await backfillNotificationPreferences(prisma, apply);

    console.log(`用户总数：${result.totalUsers}，需要补行的用户：${result.plan.length}\n`);
    for (const row of result.plan) {
      console.log(`  [${row.role}] ${row.email}`);
      for (const m of row.missing) {
        console.log(`      + ${m.eventType} enabled=${m.enabled} channels=${m.channels.join(",")}`);
      }
    }
    if (result.plan.length === 0) console.log("  (无 — 已是完整状态)");

    console.log(
      `\n${apply ? "已新增" : "待新增"}偏好行：${apply ? result.created : result.totalMissing}`,
    );
    if (!apply && result.totalMissing > 0) console.log("加 --apply 执行写入。");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes("backfill-notification-preferences")) {
  main().catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
