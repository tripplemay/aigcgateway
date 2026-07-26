/**
 * F-UA-01: default NotificationPreference rows seeded on user creation.
 *
 * Choice of defaults per spec:
 *   - BALANCE_LOW / SPENDING_RATE_EXCEEDED → inApp for every user. These
 *     relate to the caller's own money so they apply to both developers
 *     and admins out of the box.
 *   - CHANNEL_DOWN / CHANNEL_RECOVERED / PENDING_CLASSIFICATION → only
 *     ADMIN users receive them (inApp), because developers cannot act on
 *     provider health or review a classifier queue they do not own.
 *
 * Webhooks stay off by default. A user has to visit Settings and enable
 * them explicitly — this avoids accidentally POSTing to an unconfigured
 * URL.
 */
import type { NotificationEventType, Prisma, UserRole } from "@prisma/client";

// Minimal interface covering the subset of Prisma client used here.
// Using a structural type avoids coupling to Prisma.TransactionClient
// vs. the extended singleton from @/lib/prisma.
type TxLike = {
  notificationPreference: {
    createMany: (args: {
      data: {
        userId: string;
        eventType: NotificationEventType;
        channels: Prisma.InputJsonValue;
        enabled: boolean;
      }[];
      skipDuplicates?: boolean;
    }) => Promise<unknown>;
  };
};

export interface PrefSeed {
  eventType: NotificationEventType;
  channels: string[]; // e.g. ["inApp"] — webhook enabled later via Settings
  enabled: boolean;
}

const DEVELOPER_DEFAULTS: PrefSeed[] = [
  { eventType: "BALANCE_LOW", channels: ["inApp"], enabled: true },
  { eventType: "SPENDING_RATE_EXCEEDED", channels: ["inApp"], enabled: true },
  // The admin-scoped events exist as disabled rows so Settings can
  // always render every row without having to lazy-create.
  { eventType: "CHANNEL_DOWN", channels: ["inApp"], enabled: false },
  { eventType: "CHANNEL_RECOVERED", channels: ["inApp"], enabled: false },
  { eventType: "PENDING_CLASSIFICATION", channels: ["inApp"], enabled: false },
  { eventType: "AUTH_ALERT", channels: ["inApp"], enabled: false },
  { eventType: "SYNC_RECONCILE_SKIPPED", channels: ["inApp"], enabled: false },
];

const ADMIN_DEFAULTS: PrefSeed[] = [
  { eventType: "BALANCE_LOW", channels: ["inApp"], enabled: true },
  { eventType: "SPENDING_RATE_EXCEEDED", channels: ["inApp"], enabled: true },
  { eventType: "CHANNEL_DOWN", channels: ["inApp"], enabled: true },
  { eventType: "CHANNEL_RECOVERED", channels: ["inApp"], enabled: true },
  { eventType: "PENDING_CLASSIFICATION", channels: ["inApp"], enabled: true },
  // BL-DEEPSEEK-V4-HOTFIX F-DSV4-03: AUTH_ALERT 在 BL-BILLING-AUDIT-EXT-P1
  // 加进了 enum 和 trigger，却没进 seed —— dispatcher 对「无偏好行」是静默
  // 丢弃，所以那条告警从上线起就没送达过任何人。这里补齐，SYNC_RECONCILE_
  // SKIPPED 同批加入。存量用户由 scripts/backfill-notification-preferences.ts
  // 回填（seed 只在建号时跑）。
  { eventType: "AUTH_ALERT", channels: ["inApp"], enabled: true },
  { eventType: "SYNC_RECONCILE_SKIPPED", channels: ["inApp"], enabled: true },
];

export function defaultNotificationPreferences(role: UserRole): PrefSeed[] {
  return role === "ADMIN" ? ADMIN_DEFAULTS : DEVELOPER_DEFAULTS;
}

/**
 * Creates the default preference rows for a freshly-created user. Safe
 * to run inside a Prisma transaction — the caller passes the `tx`
 * client so the insert joins the same atomic registration.
 */
export async function seedDefaultNotificationPreferences(
  tx: TxLike,
  userId: string,
  role: UserRole,
): Promise<void> {
  const seeds = defaultNotificationPreferences(role);
  await tx.notificationPreference.createMany({
    data: seeds.map((s) => ({
      userId,
      eventType: s.eventType,
      channels: s.channels as unknown as Prisma.InputJsonValue,
      enabled: s.enabled,
    })),
    skipDuplicates: true,
  });
}
